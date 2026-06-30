import { useState } from "react";
import type { RefObject } from "react";
import { ALL_DENOMS, MYNT } from "./bankDenoms";
import type { Id } from "@shared/types";

type Props = {
  wishRef: RefObject<HTMLDivElement>;
  wishCounts: Record<number, number>;
  wishTotal: number;
  wishActive: boolean;
  clearWish: () => void;
  childId: Id;
  onCreateWish: (childId: Id, starsNeeded: number, title: string) => void;
};

export function BankWishZone({ wishRef, wishCounts, wishTotal, wishActive, clearWish, childId, onCreateWish }: Props) {
  const [title, setTitle] = useState("");
  const [showInput, setShowInput] = useState(false);
  const canSubmit = wishTotal > 0 && title.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onCreateWish(childId, wishTotal, title.trim());
    setTitle("");
    setShowInput(false);
    clearWish();
  };

  return (
    <div className="bm-wish-section">
      <div className="bm-wish-divider"><span>Önska något</span></div>

      <div
        ref={wishRef}
        className={`bm-wish-zone${wishActive ? " bm-wish-zone--hot" : ""}${wishTotal > 0 ? " bm-wish-zone--filled" : ""}`}
      >
        {wishTotal > 0 ? (
          <>
            <div className="bm-wish-items">
              {ALL_DENOMS.filter((v) => (wishCounts[v] ?? 0) > 0).flatMap((v) =>
                Array.from({ length: wishCounts[v] }).map((_, i) =>
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
            <div className="bm-wish-zone-footer">
              <span className="bm-wish-total">{wishTotal} kr</span>
              <button className="bm-wish-clear" type="button" onClick={clearWish} aria-label="Ta bort pengar från önskan">×</button>
            </div>
          </>
        ) : (
          <span className="bm-wish-hint">Dra hit pengar du vill erbjuda</span>
        )}
      </div>

      <div className="bm-wish-actions">
        {showInput ? (
          <input
            className="bm-wish-input"
            type="text"
            placeholder="Vad önskar du?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
          />
        ) : (
          <button
            className="bm-wish-add-btn"
            type="button"
            onClick={() => setShowInput(true)}
            disabled={wishTotal === 0}
            aria-label="Skriv vad du önskar"
          >
            + Skriv din önskan
          </button>
        )}
        <button
          className="bm-wish-submit-btn"
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-label="Fråga föräldern snälla"
          title="Fråga snälla!"
        >
          🙏
        </button>
      </div>
    </div>
  );
}
