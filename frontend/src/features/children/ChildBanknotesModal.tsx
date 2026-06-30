simport "./ChildBanknotesModal.css";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Id } from "@shared/types";
import { applyZoneConvert, applySplit, denomCounts } from "./bankDenoms";
import { BankBreakdown } from "./BankBreakdown";
import { BankCatalog } from "./BankCatalog";

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
