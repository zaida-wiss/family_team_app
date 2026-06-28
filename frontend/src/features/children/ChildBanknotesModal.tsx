import "./ChildBanknotesModal.css";
import { ArrowDown, ArrowLeft, ArrowUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SEDLAR = [1000, 500, 200, 100, 50, 20];
const MYNT = [10, 5, 2, 1];
const ALL_DENOMS = [...SEDLAR, ...MYNT];

// s: array av [målvalör, antal] — stöd för split till flera valörer
const DENOM_RULES: Partial<Record<number, { s?: Array<[number, number]> }>> = {
  1000: { s: [[500,  2]]          },
  500:  { s: [[100,  5]]          },
  200:  { s: [[100,  2]]          },
  100:  { s: [[20,   5]]          },
  50:   { s: [[10,   5]]          },
  20:   { s: [[10,   2]]          },
  10:   { s: [[5,    2]]          },
  5:    { s: [[2, 2], [1, 1]]     },
  2:    { s: [[1,    2]]          },
};

function denomCounts(kr: number): Record<number, number> {
  const result: Record<number, number> = {};
  let rem = Math.floor(kr);
  for (const v of ALL_DENOMS) {
    const n = Math.floor(rem / v);
    if (n > 0) { result[v] = n; rem -= n * v; }
  }
  return result;
}

function countsDiffer(a: Record<number, number>, b: Record<number, number>): boolean {
  const ka = Object.keys(a).sort().join(",");
  const kb = Object.keys(b).sort().join(",");
  if (ka !== kb) return true;
  return Object.keys(a).some((k) => a[+k] !== b[+k]);
}

function applySplit(value: number, prev: Record<number, number>): Record<number, number> {
  const rule = DENOM_RULES[value];
  if (!rule?.s || (prev[value] ?? 0) < 1) return prev;
  const next = { ...prev };
  next[value] = (next[value] ?? 0) - 1;
  if (next[value] <= 0) delete next[value];
  for (const [target, qty] of rule.s) {
    next[target] = (next[target] ?? 0) + qty;
  }
  return next;
}

// ── BankBreakdown ──────────────────────────────────────────────────────────

function BankBreakdown({
  counts,
  onSplit,
  onZoneConvert,
  isEmpty,
  onOpenBank,
}: {
  counts: Record<number, number>;
  onSplit: (v: number) => void;
  onZoneConvert: (remove: Record<number, number>, total: number) => void;
  isEmpty: boolean;
  onOpenBank: () => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [activeZone, setActiveZone] = useState<"up" | "down" | null>(null);
  const [fadeOut, setFadeOut] = useState<number | null>(null);
  const [fadeIn, setFadeIn] = useState<number[]>([]);
  const [zoneCounts, setZoneCounts] = useState<Record<number, number>>({});
  const [timerActive, setTimerActive] = useState(false);
  const [timerKey, setTimerKey] = useState(0);

  const upRef = useRef<HTMLDivElement>(null);
  const downRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const zoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoneCountsRef = useRef<Record<number, number>>({});

  useEffect(() => () => {
    if (zoneTimerRef.current) clearTimeout(zoneTimerRef.current);
  }, []);

  // Vad som finns kvar i plånboken (exklusive det som lagts i ↑-zonen)
  const walletCounts: Record<number, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    const inZone = zoneCounts[+k] ?? 0;
    const rem = v - inZone;
    if (rem > 0) walletCounts[+k] = rem;
  }

  const bills = SEDLAR.filter((v) => (walletCounts[v] ?? 0) > 0);
  const coins = MYNT.filter((v) => (walletCounts[v] ?? 0) > 0);

  const canSplit = (v: number) => !!(DENOM_RULES[v]?.s && (walletCounts[v] ?? 0) >= 1);

  const zoneTotal = Object.entries(zoneCounts).reduce((s, [k, n]) => s + +k * n, 0);
  const hasZoneItems = zoneTotal > 0;

  const hitZone = (ref: React.RefObject<HTMLElement | null>, x: number, y: number) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x >= r.left && x <= r.right && y >= r.top && y <= r.bottom : false;
  };

  const fireZoneConvert = () => {
    const zone = zoneCountsRef.current;
    const total = Object.entries(zone).reduce((s, [k, n]) => s + +k * n, 0);
    if (total <= 0) return;
    const result = denomCounts(total);
    const fadeInDenoms = Object.keys(result).map(Number);
    zoneCountsRef.current = {};
    setZoneCounts({});
    setTimerActive(false);
    zoneTimerRef.current = null;
    onZoneConvert({ ...zone }, total);
    setFadeIn(fadeInDenoms);
    setTimeout(() => setFadeIn([]), 400);
  };

  const addToZone = (value: number) => {
    const walletAvail = (counts[value] ?? 0) - (zoneCountsRef.current[value] ?? 0);
    if (walletAvail < 1) return;

    const newZone = {
      ...zoneCountsRef.current,
      [value]: (zoneCountsRef.current[value] ?? 0) + 1,
    };
    zoneCountsRef.current = newZone;
    setZoneCounts({ ...newZone });

    const total = Object.entries(newZone).reduce((s, [k, n]) => s + +k * n, 0);
    const result = denomCounts(total);
    const sufficient = countsDiffer(result, newZone);

    if (zoneTimerRef.current) clearTimeout(zoneTimerRef.current);

    if (sufficient) {
      setTimerKey((k) => k + 1);
      setTimerActive(true);
      zoneTimerRef.current = setTimeout(fireZoneConvert, 5000);
    } else {
      setTimerActive(false);
    }
  };

  const performSplit = (value: number) => {
    setDragging(null);
    setActiveZone(null);
    setFadeOut(value);
    const rule = DENOM_RULES[value];
    const firstTarget = rule?.s?.[0]?.[0];
    setTimeout(() => {
      onSplit(value);
      setFadeOut(null);
      if (firstTarget !== undefined) {
        setFadeIn([firstTarget]);
        setTimeout(() => setFadeIn([]), 380);
      }
    }, 240);
  };

  const startDrag = (value: number, e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    setDragging(value);

    requestAnimationFrame(() => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${startX}px`;
        ghostRef.current.style.top = `${startY}px`;
      }
    });

    const onMove = (ev: PointerEvent) => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${ev.clientX}px`;
        ghostRef.current.style.top = `${ev.clientY}px`;
      }
      const x = ev.clientX, y = ev.clientY;
      if (hitZone(upRef, x, y)) setActiveZone("up");
      else if (hitZone(downRef, x, y)) setActiveZone("down");
      else setActiveZone(null);
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const x = ev.clientX, y = ev.clientY;
      if (hitZone(upRef, x, y)) {
        setDragging(null);
        setActiveZone(null);
        addToZone(value);
      } else if (hitZone(downRef, x, y) && canSplit(value)) {
        performSplit(value);
      } else {
        setDragging(null);
        setActiveZone(null);
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const upActive = dragging !== null && activeZone === "up";
  const downActive = dragging !== null && canSplit(dragging) && activeZone === "down";
  const downOff = dragging !== null && !canSplit(dragging);

  const splitRule = dragging !== null ? DENOM_RULES[dragging] : null;

  return (
    <>
      {isEmpty ? (
        <p className="bm-empty">Tjäna fler stjärnor — varje stjärna är 1 kr! ⭐</p>
      ) : (
        <div className="bm-exchange-layout">
          <div className="bm-bills-panel">
            {bills.map((v) => (
              <div
                key={v}
                className={`bm-exch-item${dragging === v ? " bm-item-dragging" : ""}${fadeOut === v ? " bm-item-fade-out" : ""}${fadeIn.includes(v) ? " bm-item-fade-in" : ""}`}
                onPointerDown={(e) => startDrag(v, e)}
              >
                <div className="bm-exch-item-img">
                  {Array.from({ length: walletCounts[v] ?? 0 }).map((_, i) => (
                    <img
                      key={i}
                      src={`/pengar/sedel-${v}.webp`}
                      alt={i === 0 ? `${v}-kronorssedel` : ""}
                      className={`bm-note-img${i > 0 ? " bm-stacked" : ""}`}
                      data-note={v}
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
                <span className="bm-item-label">{v} kr</span>
              </div>
            ))}

            {coins.length > 0 && (
              <div className="bm-coins-row">
                {coins.map((v) => (
                  <div
                    key={v}
                    className={`bm-exch-item bm-exch-coin${dragging === v ? " bm-item-dragging" : ""}${fadeOut === v ? " bm-item-fade-out" : ""}${fadeIn.includes(v) ? " bm-item-fade-in" : ""}`}
                    onPointerDown={(e) => startDrag(v, e)}
                  >
                    <div className="bm-exch-item-img">
                      {Array.from({ length: walletCounts[v] ?? 0 }).map((_, i) => (
                        <div key={i} className={`bm-coin-clip${i > 0 ? " bm-stacked" : ""}`} data-coin={v}>
                          <img
                            src={`/pengar/mynt-${v}.webp`}
                            alt={i === 0 ? `${v}-krona` : ""}
                            className="bm-coin-img"
                            loading="lazy"
                            decoding="async"
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

          <div className="bm-drop-panel">
            <div
              ref={upRef}
              className={`bm-drop-zone bm-drop-up${upActive ? " bm-zone-hot" : ""}${hasZoneItems ? " bm-zone-has-items" : ""}`}
            >
              {hasZoneItems && (
                <span className="bm-zone-total">{zoneTotal} kr</span>
              )}
              <ArrowUp size={hasZoneItems ? 20 : 28} />
              {timerActive && <div key={timerKey} className="bm-zone-timer" />}
            </div>

            <div
              ref={downRef}
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
        </div>
      )}

      <button className="bm-bank-btn" type="button" onClick={onOpenBank}>
        🏦 Banken
      </button>

      {dragging !== null && createPortal(
        <div ref={ghostRef} className="bm-ghost">
          {MYNT.includes(dragging) ? (
            <div className="bm-coin-clip" data-coin={dragging}>
              <img src={`/pengar/mynt-${dragging}.webp`} alt="" className="bm-coin-img" />
            </div>
          ) : (
            <img
              src={`/pengar/sedel-${dragging}.webp`}
              alt=""
              className="bm-note-img"
              data-note={dragging}
            />
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ── BankCatalog ────────────────────────────────────────────────────────────

function BankCatalog() {
  return (
    <div className="bm-content">
      <p className="bm-bank-intro">Giltiga svenska sedlar och mynt</p>

      <div className="bm-bank-section bm-bank-coins-section">
        {[...MYNT].reverse().map((value) => (
          <div key={value} className="bm-bank-coin">
            <span className="bm-bank-label">{value} kr</span>
            <img
              src={`/pengar/mynt-${value}.webp`}
              alt={`${value}-krona fram och bak`}
              className="bm-bank-img bm-bank-coin-img"
              data-coin={value}
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>

      <div className="bm-bank-section">
        {[...SEDLAR].reverse().map((value) => (
          <div key={value} className="bm-bank-note">
            <span className="bm-bank-label">{value} kr</span>
            <div className="bm-bank-sides">
              <img
                src={`/pengar/sedel-${value}.webp`}
                alt={`${value}-kronorssedel framsida`}
                className="bm-bank-img bm-bank-note-img"
                data-note={value}
                loading="lazy"
                decoding="async"
              />
              <img
                src={`/pengar/sedel-${value}-bak.webp`}
                alt={`${value}-kronorssedel baksida`}
                className="bm-bank-img bm-bank-note-img"
                data-note={value}
                loading="lazy"
                decoding="async"
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

  const onSplit = (value: number) =>
    setCounts((prev) => applySplit(value, prev));

  const onZoneConvert = (remove: Record<number, number>, total: number) => {
    setCounts((prev) => {
      const next = { ...prev };
      for (const [k, n] of Object.entries(remove)) {
        next[+k] = (next[+k] ?? 0) - n;
        if ((next[+k] ?? 0) <= 0) delete next[+k];
      }
      let rem = total;
      for (const v of ALL_DENOMS) {
        const n = Math.floor(rem / v);
        if (n > 0) { next[v] = (next[v] ?? 0) + n; rem -= n * v; }
      }
      return next;
    });
  };

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
          : <BankBreakdown
              counts={counts}
              onSplit={onSplit}
              onZoneConvert={onZoneConvert}
              isEmpty={isEmpty}
              onOpenBank={() => setShowBank(true)}
            />
        }
      </div>
    </div>,
    document.body
  );
}
