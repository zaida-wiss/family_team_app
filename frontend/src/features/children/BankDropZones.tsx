import { ArrowDown, ArrowUp } from "lucide-react";
import { ALL_DENOMS, MYNT } from "./bankDenoms";
import type { BankDragZone } from "./useBankDragZone";

type Props = Pick<BankDragZone,
  "upRef" | "downRef" | "upActive" | "downActive" | "downOff" | "hasZoneItems" |
  "zoneCounts" | "zoneTotal" | "timerActive" | "timerKey" | "splitRule" | "dragging"
>;

export function BankDropZones({ upRef, downRef, upActive, downActive, downOff, hasZoneItems,
  zoneCounts, zoneTotal, timerActive, timerKey, splitRule, dragging }: Props) {
  return (
    <div className="bm-drop-panel">
      <div ref={upRef}
        className={`bm-drop-zone bm-drop-up${upActive ? " bm-zone-hot" : ""}${hasZoneItems ? " bm-zone-has-items" : ""}`}
      >
        {hasZoneItems ? (
          <>
            <div className="bm-zone-items">
              {ALL_DENOMS.filter((v) => (zoneCounts[v] ?? 0) > 0).flatMap((v) =>
                Array.from({ length: zoneCounts[v] }).map((_, i) =>
                  MYNT.includes(v) ? (
                    <div key={`${v}-${i}`} className="bm-coin-clip bm-zone-coin" data-coin={v}>
                      <img src={`/pengar/mynt-${v}.webp`} alt="" className="bm-coin-img" />
                    </div>
                  ) : (
                    <img key={`${v}-${i}`} src={`/pengar/sedel-${v}.webp`} alt="" className="bm-note-img bm-zone-note" data-note={v} />
                  )
                )
              )}
            </div>
            <span className="bm-zone-total">{zoneTotal} kr</span>
            <ArrowUp size={16} />
            {timerActive && <div key={timerKey} className="bm-zone-timer" />}
          </>
        ) : (
          <ArrowUp size={28} />
        )}
      </div>

      <div ref={downRef}
        className={`bm-drop-zone bm-drop-down${downActive ? " bm-zone-hot" : ""}${downOff ? " bm-zone-off" : ""}`}
      >
        <ArrowDown size={28} />
        {splitRule?.s && dragging !== null && (
          <span className="bm-drop-hint">
            {dragging}→{splitRule.s.map(([t, n]) => `${n}×${t}`).join("+")}
          </span>
        )}
      </div>
    </div>
  );
}
