import "./RewardShopModal.css";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { RewardShopItem, Todo } from "@shared/types";
import type { Id } from "@shared/types";
import { MYNT } from "../children/bankDenoms";
import { useShopWalletDrag } from "./useShopWalletDrag";
import { isExpired, isAvailableNow, unavailableLabel, blockingCategories } from "./shopAvailability";

type Props = {
  childId: Id;
  items: RewardShopItem[];
  todos: Todo[];
  availableStars: number;
  requireApprovalForCategories: boolean;
  onPurchase: (item: RewardShopItem) => void;
  onClose: () => void;
};

export function RewardShopModal({ childId, items, todos, availableStars, requireApprovalForCategories, onPurchase, onClose }: Props) {
  const drag = useShopWalletDrag(childId);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const purchasingRef = useRef<Set<string>>(new Set());

  // Dölj varor vars slutdatum passerat — de finns kvar i databasen men ska inte visas
  const visibleItems = items.filter((item) => !isExpired(item));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-purchase when dragged total reaches the price
  useEffect(() => {
    for (const item of items) {
      const paid = drag.getCardTotal(item.id);
      if (paid >= item.starCost && paid > 0 && !purchasingRef.current.has(item.id)) {
        purchasingRef.current.add(item.id);
        setFlashingId(item.id);
        setTimeout(() => {
          drag.commitPurchase(item.id);
          onPurchase(item);
          setFlashingId(null);
          purchasingRef.current.delete(item.id);
        }, 650);
      }
    }
  });

  return (
    <div className="reward-shop-overlay" onClick={onClose}>
      <div className="reward-shop-modal" onClick={(e) => e.stopPropagation()}>

        <div className="reward-shop-modal__header">
          <span className="reward-shop-modal__title">🏪 Belöningsbutiken</span>
          <span className="reward-shop-modal__stars">⭐ {availableStars}</span>
          <button className="reward-shop-modal__close" onClick={onClose} aria-label="Stäng">✕</button>
        </div>

        {visibleItems.length === 0 ? (
          <p className="reward-shop-modal__empty">Inga belöningar finns än.</p>
        ) : (
          <div className="reward-shop-modal__grid">
            {visibleItems.map((item) => {
              const blocking = blockingCategories(item, todos, childId, requireApprovalForCategories);
              const available = isAvailableNow(item) && blocking.length === 0;
              const label = blocking.length > 0
                ? `Kräver: ${blocking.join(", ")}`
                : unavailableLabel(item);
              const cardCounts = drag.pendingPayments[item.id] ?? {};
              const paid = drag.getCardTotal(item.id);
              const isTarget = drag.activeCardId === item.id;
              const isFlashing = flashingId === item.id;
              const hasPayment = paid > 0;

              return (
                <div
                  key={item.id}
                  data-item-id={available ? item.id : undefined}
                  className={[
                    "reward-shop-card",
                    !available ? "reward-shop-card--unavailable" : "",
                    isTarget ? "reward-shop-card--drag-target" : "",
                    isFlashing ? "reward-shop-card--flash" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {/* Prislapp */}
                  <span className="shop-price-tag">{item.starCost} kr</span>

                  {/* Kortets fasta innehåll */}
                  <span className="reward-shop-card__symbol">{item.symbol ?? "🎁"}</span>
                  <span className="reward-shop-card__title">{item.title}</span>
                  {item.timerMinutes !== null && (
                    <span className="reward-shop-card__timer">⏱ {item.timerMinutes} min</span>
                  )}
                  {label && (
                    <span className="reward-shop-card__unavailable-label">{label}</span>
                  )}

                  {/* Pengar lagda ovanpå kortet */}
                  {hasPayment && (
                    <div className="shop-card-money-layer">
                      {Object.entries(cardCounts).flatMap(([denom, count]) =>
                        Array.from({ length: count }).map((_, i) =>
                          MYNT.includes(Number(denom)) ? (
                            <div
                              key={`${denom}-${i}`}
                              className="shop-card-coin-clip shop-card-money-item"
                              data-coin={denom}
                              onPointerDown={(e) => drag.startCardDrag(Number(denom), item.id, e)}
                            >
                              <img src={`/pengar/mynt-${denom}.webp`} alt="" className="shop-card-coin-img" />
                            </div>
                          ) : (
                            <img
                              key={`${denom}-${i}`}
                              src={`/pengar/sedel-${denom}.webp`}
                              alt=""
                              className="shop-card-note-img shop-card-money-item"
                              data-note={denom}
                              onPointerDown={(e) => drag.startCardDrag(Number(denom), item.id, e)}
                            />
                          )
                        )
                      )}
                      <button
                        className="shop-card-money-clear"
                        type="button"
                        onClick={() => drag.clearCardPayment(item.id)}
                        aria-label="Returnera alla pengar till plånboken"
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(() => {
          const walletTotal = Object.entries(drag.walletCounts).reduce(
            (s, [k, n]) => s + Number(k) * n, 0
          );
          const hasCoins = drag.coins.length > 0;
          const hasBills = drag.bills.length > 0;
          return (
            <div className="shop-wallet">
              <span className="shop-wallet__label">
                💳 Plånbok{walletTotal > 0 ? <> — <strong>{walletTotal} kr</strong> — dra till en belöning</> : ""}
              </span>
              {hasBills || hasCoins ? (
                <div className="shop-wallet__strip">
                  {drag.bills.map((v) => {
                    const count = drag.walletCounts[v] ?? 0;
                    return (
                      <div
                        key={v}
                        className={`shop-wallet-denom${drag.dragging === v ? " shop-wallet-denom--dragging" : ""}`}
                        onPointerDown={(e) => drag.startDrag(v, e)}
                      >
                        <div className="shop-note-stack">
                          {Array.from({ length: count }).map((_, i) => (
                            <img
                              key={i}
                              src={`/pengar/sedel-${v}.webp`}
                              alt={i === 0 ? `${v}-kronorssedel` : ""}
                              className={`shop-note-img${i > 0 ? " shop-note-stacked" : ""}`}
                              data-note={v}
                              draggable={false}
                            />
                          ))}
                        </div>
                        <span className="shop-wallet-denom-label">{v} kr</span>
                      </div>
                    );
                  })}
                  {drag.coins.map((v) => {
                    const count = drag.walletCounts[v] ?? 0;
                    return (
                      <div
                        key={v}
                        className={`shop-wallet-denom${drag.dragging === v ? " shop-wallet-denom--dragging" : ""}`}
                        onPointerDown={(e) => drag.startDrag(v, e)}
                      >
                        <div className="shop-coin-stack">
                          {Array.from({ length: count }).map((_, i) => (
                            <div
                              key={i}
                              className={`shop-coin-clip${i > 0 ? " shop-coin-stacked" : ""}`}
                              data-coin={v}
                            >
                              <img
                                src={`/pengar/mynt-${v}.webp`}
                                alt={i === 0 ? `${v}-krona` : ""}
                                className="shop-coin-img"
                                draggable={false}
                              />
                            </div>
                          ))}
                        </div>
                        <span className="shop-wallet-denom-label">{v} kr</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="shop-wallet__empty">Inga pengar än — tjäna stjärnor så syns de här!</p>
              )}
            </div>
          );
        })()}
      </div>

      {drag.dragging !== null && createPortal(
        <div ref={drag.ghostRef} className="shop-ghost">
          {MYNT.includes(drag.dragging) ? (
            <div className="shop-coin-clip" data-coin={drag.dragging}>
              <img src={`/pengar/mynt-${drag.dragging}.webp`} alt="" className="shop-coin-img" />
            </div>
          ) : (
            <img
              src={`/pengar/sedel-${drag.dragging}.webp`}
              alt=""
              className="shop-note-img shop-ghost-note"
              data-note={drag.dragging}
            />
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
