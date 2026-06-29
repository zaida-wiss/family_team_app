simport "./ChildBanknotesModal.css";
import { ArrowDown, ArrowLeft, ArrowUp, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
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

// ── BankBreakdown — koordinator ────────────────────────────────────────────

function BankBreakdown({ counts, onSplit, onZoneConvert, isEmpty, onOpenBank }: {
  counts: Record<number, number>;
  onSplit: (v: number) => void;
  onZoneConvert: (remove: Record<number, number>, total: number) => void;
  isEmpty: boolean;
  onOpenBank: () => void;
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
  totalKronor: number;
  onClose: () => void;
};

export function ChildBanknotesModal({ totalKronor, onClose }: Props) {
  const [showBank, setShowBank] = useState(false);
  const [counts, setCounts] = useState(() => denomCounts(totalKronor));

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
            />
        }
      </div>
    </div>,
    document.body
  );
}
