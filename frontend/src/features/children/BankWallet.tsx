import { Plus, Scissors, Star } from "lucide-react";
import type { BankDragZone } from "./useBankDragZone";
import { stackDisplayGroups } from "./bankDenoms";

type Props = Pick<BankDragZone,
  "bills" | "coins" | "walletCounts" | "dragging" | "fadeOut" | "fadeIn" | "startDrag"
  | "addToZone" | "canSplit" | "performSplit" | "addToWish"
> & { mode: "drag" | "click" };

export function BankWallet({ bills, coins, walletCounts, dragging, fadeOut, fadeIn, startDrag, addToZone, canSplit, performSplit, addToWish, mode }: Props) {
  const isClick = mode === "click";

  const itemClass = (v: number) =>
    `bm-exch-item${isClick ? " bm-item-clickmode" : ""}${dragging === v ? " bm-item-dragging" : ""}${fadeOut === v ? " bm-item-fade-out" : ""}${fadeIn.includes(v) ? " bm-item-fade-in" : ""}`;

  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

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
        <div key={v} className={itemClass(v)} onPointerDown={(e) => { if (!isClick) startDrag(v, e); }}>
          <div className="bm-exch-item-img">
            {(() => {
              const { tens, remainder } = stackDisplayGroups(walletCounts[v] ?? 0);
              return (
                <>
                  {Array.from({ length: tens }).map((_, t) => (
                    <div key={`ten-${t}`} className="bm-note-tenstack" data-note={v}>
                      <div className="bm-note-tenstack__body" aria-hidden="true" />
                      <div className="bm-note-tenstack__ground" aria-hidden="true" />
                      <span className="bm-note-tenstack__badge">10</span>
                    </div>
                  ))}
                  {Array.from({ length: remainder }).map((_, i) => (
                    <img key={i} src={`/pengar/sedel-${v}.webp`}
                      alt={i === 0 && tens === 0 ? `${v}-kronorssedel` : ""}
                      className={`bm-note-img${i > 0 ? (i % 5 === 0 ? " bm-seam" : " bm-stacked") : ""}`}
                      data-note={v} loading="lazy" decoding="async" draggable={false}
                    />
                  ))}
                </>
              );
            })()}
          </div>
          <span className="bm-item-label">{v} kr</span>
          {isClick && renderActions(v, false)}
        </div>
      ))}

      {coins.length > 0 && (
        <div className="bm-coins-row">
          {coins.map((v) => (
            <div key={v} className={`${itemClass(v)} bm-exch-coin`} onPointerDown={(e) => { if (!isClick) startDrag(v, e); }}>
              <div className="bm-exch-item-img">
                {(() => {
                  const { tens, remainder } = stackDisplayGroups(walletCounts[v] ?? 0);
                  return (
                    <>
                      {Array.from({ length: tens }).map((_, t) => (
                        <div key={`ten-${t}`} className="bm-coin-tenstack" data-coin={v}>
                          <div className="bm-coin-tenstack__rim" aria-hidden="true" />
                          <div className="bm-coin-tenstack__body" aria-hidden="true" />
                          <div className="bm-coin-tenstack__ground" aria-hidden="true" />
                          <span className="bm-coin-tenstack__badge">10</span>
                        </div>
                      ))}
                      {Array.from({ length: remainder }).map((_, i) => (
                        <div key={i} className={`bm-coin-clip${i > 0 ? (i % 5 === 0 ? " bm-seam" : " bm-stacked") : ""}`} data-coin={v}>
                          <img src={`/pengar/mynt-${v}.webp`} alt={i === 0 && tens === 0 ? `${v}-krona` : ""}
                            className="bm-coin-img" loading="lazy" decoding="async" draggable={false}
                          />
                        </div>
                      ))}
                    </>
                  );
                })()}
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
