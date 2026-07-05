import { Banknote, Palette, ShoppingBag, Star, Trophy } from "lucide-react";
import { useState } from "react";
import type { Id } from "@shared/types";
import { ChildBanknotesModal } from "./ChildBanknotesModal";
import "./ChildStarsPanel.css";

type Props = {
  childId: Id;
  approvedStarsToday: number;
  totalApprovedStars: number;
  onOpenShop: () => void;
  onThemePickerOpen: () => void;
  onOpenRecords: () => void;
  onCreateWish: (childId: Id, starsNeeded: number, title: string) => void;
};

export function ChildStarsPanel({
  childId,
  approvedStarsToday,
  totalApprovedStars,
  onOpenShop,
  onThemePickerOpen,
  onOpenRecords,
  onCreateWish,
}: Props) {
  const [showBanknotes, setShowBanknotes] = useState(false);

  return (
    <div className="child-bottom-panels">
      <div className="child-stars-panel">
        <button
          className="child-theme-button"
          type="button"
          onClick={onThemePickerOpen}
          aria-label="Byt tema"
          title="Byt tema"
        >
          <Palette size={18} />
        </button>

        <div className="child-stars-stat">
          <span>Stjärnor idag</span>
          <strong><Star size={34} fill="currentColor" /> {approvedStarsToday}</strong>
        </div>

        <div className="child-stars-stat child-stars-stat--total">
          <span>Totalt</span>
          <strong><Star size={34} fill="currentColor" /> {totalApprovedStars}</strong>
        </div>

        <button className="child-shop-card" type="button" onClick={onOpenShop}>
          <ShoppingBag size={28} />
          <span>
            <strong>Shop</strong>
            <small>Använd dina stjärnor</small>
          </span>
        </button>

        <button
          className="child-money-card"
          type="button"
          aria-label={`Plånbok — ${totalApprovedStars} kr`}
          onClick={() => setShowBanknotes(true)}
        >
          <Banknote size={28} />
          <span>
            <strong>Plånbok</strong>
            <small>{totalApprovedStars} kr</small>
          </span>
        </button>

        {showBanknotes && (
          <ChildBanknotesModal
            childId={childId}
            totalKronor={totalApprovedStars}
            onClose={() => setShowBanknotes(false)}
            onCreateWish={onCreateWish}
          />
        )}

        {/* Pokal-knappen till höger om plånboken (2026-07-06, Zaidas beslut,
            efter att en placering bredvid profilbilden klippte av avataren) —
            öppnar Rekord-sidan (ChildRecordsPage). */}
        <button
          className="child-theme-button child-records-button"
          type="button"
          onClick={onOpenRecords}
          aria-label="Rekord"
          title="Rekord"
        >
          <Trophy size={18} />
        </button>

        <small className="child-stars-footnote">1 stjärna = 1 kr</small>
      </div>
    </div>
  );
}
