import "./RewardShopModal.css";
import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import type { RewardShopItem, Todo } from "@shared/types";
import type { Id } from "@shared/types";
import { MYNT } from "../children/bankDenoms";
import { useShopWalletDrag } from "./useShopWalletDrag";
import { useAutoPurchase } from "./useAutoPurchase";
import { ReturningBill } from "./ReturningBill";
import { isExpired, isAvailableNow, minutesUntilAvailable, unavailableLabel, blockingCategories } from "./shopAvailability";
import { useRewardShopContext } from "./RewardShopContext";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { useModalA11y } from "../../hooks/useModalA11y";

const UPCOMING_WINDOW_MINUTES = 4 * 60;
const FREE_HOLD_DURATION_MS = 2000;

type Props = {
  childId: Id;
  items: RewardShopItem[];
  todos: Todo[];
  availableStars: number;
  onPurchase: (item: RewardShopItem) => void;
  onClose: () => void;
};

export function RewardShopModal({ childId, items, todos, availableStars, onPurchase, onClose }: Props) {
  const { requireApprovalForCategories } = useRewardShopContext();
  const drag = useShopWalletDrag(childId, availableStars);
  const walletStripRef = useRef<HTMLDivElement>(null);
  const { flashingId, setFlashingId, returningBills } = useAutoPurchase(items, drag, walletStripRef, onPurchase);
  // Gratis belöningar (0 kr) har inga pengar att dra — håll in kortet 2 sekunder
  // istället, samma mönster som att avklara ett uppdragskort.
  const { heldId: heldFreeItemId, startHold: startFreeHold, clearHold: clearFreeHold } =
    useHoldToConfirm(FREE_HOLD_DURATION_MS);

  // Klick-läge (WCAG 2.1.1/2.5.7) — samma "Dra/Klicka"-mönster som redan finns i
  // ChildBanknotesModal/BankBreakdown för samma sorts sedel/mynt-interaktion.
  // I klick-läge väljer man först ett kort som betalmål, sedan klickar man pengar
  // i plånboken för att lägga dem på det valda kortet.
  const [mode, setMode] = useState<"drag" | "click">("drag");
  const [selectedCardIdRaw, setSelectedCardId] = useState<string | null>(null);

  // Dölj varor vars slutdatum passerat och varor som är kategori-spärrade (ogjord
  // uppgift). Varor som öppnar inom 4 timmar visas tonade så barnet ser att de är på
  // väg; allt annat tidsfönster-blockerat döljs helt tills det är nära nog att spela roll.
  // Sortering: tillgängliga överst, tonade (snart tillgängliga) längst ner; billigast
  // först inom varje grupp.
  const visibleItems = items
    .filter((item) => {
      if (isExpired(item)) return false;
      const blocking = blockingCategories(item, todos, childId, requireApprovalForCategories);
      if (blocking.length > 0) return false;
      if (isAvailableNow(item)) return true;
      const minutesLeft = minutesUntilAvailable(item);
      return minutesLeft !== null && minutesLeft <= UPCOMING_WINDOW_MINUTES;
    })
    .sort((a, b) => {
      const availableDiff = Number(isAvailableNow(b)) - Number(isAvailableNow(a));
      if (availableDiff !== 0) return availableDiff;
      return a.starCost - b.starCost;
    });

  // Självläkande — om det valda kortet hinner köpas/försvinna (t.ex. via auto-köp)
  // innan man hunnit avmarkera det, ska plånbokens klick-knappar inte fortsätta peka
  // på ett kort som inte längre finns.
  const selectedCardId = visibleItems.some((i) => i.id === selectedCardIdRaw) ? selectedCardIdRaw : null;

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  function confirmFreeItem(item: RewardShopItem) {
    setFlashingId(item.id);
    setTimeout(() => {
      onPurchase(item);
      setFlashingId(null);
    }, 650);
  }

  return (
    <div className="reward-shop-overlay" onClick={onClose}>
      <div
        aria-labelledby="reward-shop-modal-title"
        aria-modal="true"
        className="reward-shop-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >

        <div className="reward-shop-modal__header">
          <span className="reward-shop-modal__title" id="reward-shop-modal-title">🏪 Belöningsbutiken</span>
          <span className="reward-shop-modal__stars">⭐ {availableStars}</span>
          <button className="reward-shop-modal__close" onClick={onClose} aria-label="Stäng">✕</button>
        </div>

        <div className="reward-shop-modal__mode-toggle" role="group" aria-label="Välj interaktionssätt">
          <button
            type="button"
            className={`reward-shop-modal__mode-btn${mode === "drag" ? " reward-shop-modal__mode-btn--active" : ""}`}
            onClick={() => { setMode("drag"); setSelectedCardId(null); }}
            aria-pressed={mode === "drag"}
          >
            Dra
          </button>
          <button
            type="button"
            className={`reward-shop-modal__mode-btn${mode === "click" ? " reward-shop-modal__mode-btn--active" : ""}`}
            onClick={() => setMode("click")}
            aria-pressed={mode === "click"}
          >
            Klicka
          </button>
        </div>

        {mode === "click" && (
          <p className="reward-shop-modal__mode-hint">
            {selectedCardId
              ? "Klicka pengar i plånboken för att lägga dem på den valda belöningen."
              : "Klicka en belöning för att välja den som betalmål."}
          </p>
        )}

        {visibleItems.length === 0 ? (
          <p className="reward-shop-modal__empty">Inga belöningar finns än.</p>
        ) : (
          <div className="reward-shop-modal__grid">
            {visibleItems.map((item) => {
              const available = isAvailableNow(item);
              const label = available ? null : unavailableLabel(item);
              const cardCounts = drag.pendingPayments[item.id] ?? {};
              const paid = drag.getCardTotal(item.id);
              const isFree = item.starCost === 0;
              const isSelectable = mode === "click" && available && !isFree;
              const isSelected = isSelectable && selectedCardId === item.id;
              const isTarget = mode === "drag" ? drag.activeCardId === item.id : isSelected;
              const isFlashing = flashingId === item.id;
              const hasPayment = paid > 0;
              const isHeldFree = isFree && heldFreeItemId === item.id;

              function toggleSelected() {
                setSelectedCardId((current) => (current === item.id ? null : item.id));
              }

              return (
                <div
                  key={item.id}
                  data-item-id={available ? item.id : undefined}
                  className={[
                    "reward-shop-card",
                    !available ? "reward-shop-card--unavailable" : "",
                    isTarget ? "reward-shop-card--drag-target" : "",
                    isFlashing ? "reward-shop-card--flash" : "",
                    isHeldFree ? "reward-shop-card--holding" : "",
                  ].filter(Boolean).join(" ")}
                  {...(mode === "drag" && isFree && available
                    ? {
                        onPointerDown: () => startFreeHold(item.id, () => confirmFreeItem(item)),
                        onPointerUp: clearFreeHold,
                        onPointerLeave: clearFreeHold,
                        onPointerCancel: clearFreeHold,
                      }
                    : {})}
                  {...(isSelectable
                    ? {
                        role: "button" as const,
                        tabIndex: 0,
                        "aria-pressed": isSelected,
                        "aria-label": `${item.title}, ${item.starCost} kr${isSelected ? " — valt som betalmål" : ""}`,
                        onClick: toggleSelected,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelected();
                          }
                        },
                      }
                    : {})}
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
                  {mode === "click" && isFree && available && (
                    <button
                      className="reward-shop-card__claim-btn"
                      type="button"
                      onClick={() => confirmFreeItem(item)}
                    >
                      Hämta
                    </button>
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
                💳 Plånbok{walletTotal > 0 ? <> — <strong>{walletTotal} kr</strong> — {mode === "drag" ? "dra till en belöning" : "klicka för att lägga på vald belöning"}</> : ""}
              </span>
              {hasBills || hasCoins ? (
                <div className="shop-wallet__strip" ref={walletStripRef}>
                  {drag.bills.map((v) => {
                    const count = drag.walletCounts[v] ?? 0;
                    const clickDisabled = mode === "click" && !selectedCardId;
                    return (
                      <div
                        key={v}
                        className={`shop-wallet-denom${drag.dragging === v ? " shop-wallet-denom--dragging" : ""}${clickDisabled ? " shop-wallet-denom--disabled" : ""}`}
                        {...(mode === "drag"
                          ? { onPointerDown: (e: React.PointerEvent) => drag.startDrag(v, e) }
                          : {
                              role: "button" as const,
                              tabIndex: clickDisabled ? -1 : 0,
                              "aria-disabled": clickDisabled,
                              "aria-label": `Lägg ${v} kr på vald belöning`,
                              onClick: () => selectedCardId && drag.addOneToCard(v, selectedCardId),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if ((e.key === "Enter" || e.key === " ") && selectedCardId) {
                                  e.preventDefault();
                                  drag.addOneToCard(v, selectedCardId);
                                }
                              },
                            })}
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
                    const clickDisabled = mode === "click" && !selectedCardId;
                    return (
                      <div
                        key={v}
                        className={`shop-wallet-denom${drag.dragging === v ? " shop-wallet-denom--dragging" : ""}${clickDisabled ? " shop-wallet-denom--disabled" : ""}`}
                        {...(mode === "drag"
                          ? { onPointerDown: (e: React.PointerEvent) => drag.startDrag(v, e) }
                          : {
                              role: "button" as const,
                              tabIndex: clickDisabled ? -1 : 0,
                              "aria-disabled": clickDisabled,
                              "aria-label": `Lägg ${v} kr på vald belöning`,
                              onClick: () => selectedCardId && drag.addOneToCard(v, selectedCardId),
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if ((e.key === "Enter" || e.key === " ") && selectedCardId) {
                                  e.preventDefault();
                                  drag.addOneToCard(v, selectedCardId);
                                }
                              },
                            })}
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

      {returningBills.length > 0 && createPortal(
        <>
          {returningBills.map((bill) => (
            <ReturningBill key={bill.id} {...bill} />
          ))}
        </>,
        document.body
      )}
    </div>
  );
}
