import { Plus, Scissors, Star } from "lucide-react";
import type { BankDragZone } from "./useBankDragZone";

type Props = Pick<BankDragZone,
  "bills" | "coins" | "walletCounts" | "dragging" | "fadeOut" | "fadeIn" | "startDrag"
  | "addToZone" | "canSplit" | "performSplit" | "addToWish"
> & { mode: "drag" | "click" };

export function BankWallet({ bills, coins, walletCounts, dragging, fadeOut, fadeIn, startDrag, addToZone, canSplit, performSplit, addToWish, mode }: Props) {
  const isClick = mode === "click";

  const itemClass = (v: number) =>
    `bm-exch-item${isClick ? " bm-item-clickmode" : ""}${dragging === v ? " bm-item-dragging" : ""}${fadeOut === v ? " bm-item-fade-out" : ""}${fadeIn.includes(v) ? " bm-item-fade-in" : ""}`;

  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();
  const onCardPointer = (v: number, e: React.PointerEvent) => {
    if (!isClick) startDrag(v, e);
  };

  const renderActions = (v: number, isCoin: boolean) => (
    <div className="bm-item-actions" onPointerDown={stopDrag}>
      <button
        className="bm-item-action-btn"
        type="button"
        onClick={() => addToZone(v)}
        aria-label={`Lägg till ${v}-kronors${isCoin ? "mynt" : "sedel"} i byteszonen`}
      >
        <Plus size={13} />
      </button>
      {canSplit(v) && (
        <button
          className="bm-item-action-btn"
          type="button"
          onClick={() => performSplit(v)}
          aria-label={`Dela upp ${v}-kronors${isCoin ? "mynt" : "sedel"} i mindre valörer`}
        >
          <Scissors size={13} />
        </button>
      )}
      <button
        className="bm-item-action-btn"
        type="button"
        onClick={() => addToWish(v)}
        aria-label={`Lägg ${v}-kronors${isCoin ? "mynt" : "sedel"} i önskningslistan`}
      >
        <Star size={13} />
      </button>
    </div>
  );

  return (
    <div className="bm-bills-panel">
      {bills.map((v) => (
        <div key={v} className={itemClass(v)} onPointerDown={(e) => onCardPointer(v, e)}>
          <div className="bm-exch-item-img">
            {Array.from({ length: walletCounts[v] ?? 0 }).map((_, i) => (
              <img key={i} src={`/pengar/sedel-${v}.webp`}
                alt={i === 0 ? `${v}-kronorssedel` : ""}
                className={`bm-note-img${i > 0 ? " bm-stacked" : ""}`}
                data-note={v} loading="lazy" decoding="async"
              />
            ))}
          </div>
          <span className="bm-item-label">{v} kr</span>
          {isClick && renderActions(v, false)}
        </div>
      ))}

      {coins.length > 0 && (
        <div className="bm-coins-row">
          {coins.map((v) => (
            <div key={v} className={`${itemClass(v)} bm-exch-coin`} onPointerDown={(e) => onCardPointer(v, e)}>
              <div className="bm-exch-item-img">
                {Array.from({ length: walletCounts[v] ?? 0 }).map((_, i) => (
                  <div key={i} className={`bm-coin-clip${i > 0 ? " bm-stacked" : ""}`} data-coin={v}>
                    <img src={`/pengar/mynt-${v}.webp`} alt={i === 0 ? `${v}-krona` : ""}
                      className="bm-coin-img" loading="lazy" decoding="async"
                    />
                  </div>
                ))}
              </div>
              <span className="bm-item-label">{v} kr</span>
              {isClick && renderActions(v, true)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
