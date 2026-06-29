import "./ChildBanknotesModal.css";
import { ArrowDown, ArrowLeft, ArrowUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { Id } from "@shared/types";
import { ALL_DENOMS, MYNT, SEDLAR, applyZoneConvert, applySplit, denomCounts } from "./bankDenoms";
import type { BankDragZone } from "./useBankDragZone";
import { useBankDragZone } from "./useBankDragZone";

// ── BankWallet — visar barnets sedlar och mynt ────────────────────────────

function BankWallet({ bills, coins, walletCounts, dragging, fadeOut, fadeIn, startDrag }: Pick<BankDragZone,
  "bills" | "coins" | "walletCounts" | "dragging" | "fadeOut" | "fadeIn" | "startDrag"
>) {
  const itemClass = (v: number) =>
    `bm-exch-item${dragging === v ? " bm-item-dragging" : ""}${fadeOut === v ? " bm-item-fade-out" : ""}${fadeIn.includes(v) ? " bm-item-fade-in" : ""}`;

  return (
    <div className="bm-bills-panel">
      {bills.map((v) => (
        <div key={v} className={itemClass(v)} onPointerDown={(e) => startDrag(v, e)}>
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
        </div>
      ))}

      {coins.length > 0 && (
        <div className="bm-coins-row">
          {coins.map((v) => (
            <div key={v} className={`${itemClass(v)} bm-exch-coin`} onPointerDown={(e) => startDrag(v, e)}>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── BankDropZones — växelzoner (dra upp = växla upp, dra ned = dela) ──────

function BankDropZones({ upRef, downRef, upActive, downActive, downOff, hasZoneItems,
  zoneCounts, zoneTotal, timerActive, timerKey, splitRule, dragging }: Pick<BankDragZone,
  "upRef" | "downRef" | "upActive" | "downActive" | "downOff" | "hasZoneItems" |
  "zoneCounts" | "zoneTotal" | "timerActive" | "timerKey" | "splitRule" | "dragging"
>) {
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

// ── BankWishZone — dragzon längst ner för önskans betalning ──────────────

function BankWishZone({ wishRef, wishCounts, wishTotal, wishActive, clearWish, childId, onCreateWish }: {
  wishRef: RefObject<HTMLDivElement>;
  wishCounts: Record<number, number>;
  wishTotal: number;
  wishActive: boolean;
  clearWish: () => void;
  childId: Id;
  onCreateWish: (childId: Id, starsNeeded: number, title: string) => void;
}) {
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

// ── BankBreakdown — koordinator ────────────────────────────────────────────

function BankBreakdown({ counts, onSplit, onZoneConvert, isEmpty, onOpenBank, childId, onCreateWish }: {
  counts: Record<number, number>;
  onSplit: (v: number) => void;
  onZoneConvert: (remove: Record<number, number>, total: number) => void;
  isEmpty: boolean;
  onOpenBank: () => void;
  childId: Id;
  onCreateWish: (childId: Id, starsNeeded: number, title: string) => void;
}) {
  const zone = useBankDragZone(counts, onSplit, onZoneConvert);

  return (
    <>
      {isEmpty ? (
        <p className="bm-empty">Tjäna fler stjärnor — varje stjärna är 1 kr! ⭐</p>
      ) : (
        <div className="bm-exchange-layout">
          <BankWallet {...zone} />
          <BankDropZones {...zone} />
        </div>
      )}

      <BankWishZone
        wishRef={zone.wishRef}
        wishCounts={zone.wishCounts}
        wishTotal={zone.wishTotal}
        wishActive={zone.wishActive}
        clearWish={zone.clearWish}
        childId={childId}
        onCreateWish={onCreateWish}
      />

      <button className="bm-bank-btn" type="button" onClick={onOpenBank}>🏦 Banken</button>

      {zone.dragging !== null && createPortal(
        <div ref={zone.ghostRef} className="bm-ghost">
          {MYNT.includes(zone.dragging) ? (
            <div className="bm-coin-clip" data-coin={zone.dragging}>
              <img src={`/pengar/mynt-${zone.dragging}.webp`} alt="" className="bm-coin-img" />
            </div>
          ) : (
            <img src={`/pengar/sedel-${zone.dragging}.webp`} alt="" className="bm-note-img" data-note={zone.dragging} />
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ── BankCatalog — alla giltiga sedlar/mynt från riksbanken ────────────────

function BankCatalog() {
  return (
    <div className="bm-content">
      <p className="bm-bank-intro">Giltiga svenska sedlar och mynt</p>

      <div className="bm-bank-section bm-bank-coins-section">
        {[...MYNT].reverse().map((value) => (
          <div key={value} className="bm-bank-coin">
            <span className="bm-bank-label">{value} kr</span>
            <img src={`/pengar/mynt-${value}.webp`} alt={`${value}-krona fram och bak`}
              className="bm-bank-img bm-bank-coin-img" data-coin={value}
              loading="lazy" decoding="async"
            />
          </div>
        ))}
      </div>

      <div className="bm-bank-section">
        {[...SEDLAR].reverse().map((value) => (
          <div key={value} className="bm-bank-note">
            <span className="bm-bank-label">{value} kr</span>
            <div className="bm-bank-sides">
              <img src={`/pengar/sedel-${value}.webp`} alt={`${value}-kronorssedel framsida`}
                className="bm-bank-img bm-bank-note-img" data-note={value}
                loading="lazy" decoding="async"
              />
              <img src={`/pengar/sedel-${value}-bak.webp`} alt={`${value}-kronorssedel baksida`}
                className="bm-bank-img bm-bank-note-img" data-note={value}
                loading="lazy" decoding="async"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ChildBanknotesModal ────────────────────────────────────────────────────

type Props = {
  childId: Id;
  totalKronor: number;
  onClose: () => void;
  onCreateWish: (childId: Id, starsNeeded: number, title: string) => void;
};

function loadCounts(childId: Id, totalKronor: number): Record<number, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(`bank-counts-${childId}`) ?? "null") as
      | { counts: Record<number, number>; savedTotal: number }
      | null;
    if (!stored) return denomCounts(totalKronor);
    if (stored.savedTotal === totalKronor) return stored.counts;
    if (totalKronor > stored.savedTotal) {
      const delta = denomCounts(totalKronor - stored.savedTotal);
      const merged = { ...stored.counts };
      for (const [d, n] of Object.entries(delta)) {
        merged[Number(d)] = (merged[Number(d)] ?? 0) + n;
      }
      return merged;
    }
    return denomCounts(totalKronor);
  } catch {
    return denomCounts(totalKronor);
  }
}

export function ChildBanknotesModal({ childId, totalKronor, onClose, onCreateWish }: Props) {
  const [showBank, setShowBank] = useState(false);
  const [counts, setCounts] = useState(() => loadCounts(childId, totalKronor));

  useEffect(() => {
    localStorage.setItem(
      `bank-counts-${childId}`,
      JSON.stringify({ counts, savedTotal: totalKronor })
    );
  }, [counts, childId, totalKronor]);

  const isEmpty = Object.keys(counts).length === 0;
  const onSplit = (value: number) => setCounts((prev) => applySplit(value, prev));
  const onZoneConvert = (remove: Record<number, number>, total: number) =>
    setCounts((prev) => applyZoneConvert(prev, remove, total));

  return createPortal(
    <div className="bm-overlay" onClick={onClose}>
      <div className="bm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bm-handle" />

        <div className="bm-header">
          <div className="bm-header-left">
            {showBank && (
              <button className="bm-back" type="button" aria-label="Tillbaka" onClick={() => setShowBank(false)}>
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h3 className="bm-title">{showBank ? "Banken" : "Dina stjärnor i pengar"}</h3>
              {!showBank && <p className="bm-amount">{totalKronor} kr</p>}
            </div>
          </div>
          <button className="bm-close" onClick={onClose} type="button" aria-label="Stäng">
            <X size={22} />
          </button>
        </div>

        <p className="bm-credit">Bilder: Sveriges Riksbank</p>

        {showBank
          ? <BankCatalog />
          : <BankBreakdown counts={counts} onSplit={onSplit} onZoneConvert={onZoneConvert}
              isEmpty={isEmpty} onOpenBank={() => setShowBank(true)}
              childId={childId} onCreateWish={onCreateWish}
            />
        }
      </div>
    </div>,
    document.body
  );
}
