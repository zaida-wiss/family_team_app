import { Banknote, Palette, ShoppingBag, Star, Trophy } from "lucide-react";
import { useState } from "react";
import type { Reward, RewardPathProgress } from "@shared/types";
import { ChildBanknotesModal } from "./ChildBanknotesModal";
import "./ChildStarsPanel.css";
import "./ChildRewardRail.css";

type Props = {
  approvedStarsToday: number;
  totalApprovedStars: number;
  activeReward: Reward | null;
  rewardProgress: RewardPathProgress | null;
  onOpenShop: () => void;
  onThemePickerOpen: () => void;
};

export function ChildStarsPanel({
  approvedStarsToday,
  totalApprovedStars,
  activeReward,
  rewardProgress,
  onOpenShop,
  onThemePickerOpen,
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
          aria-label={`${totalApprovedStars} kr — se i sedlar`}
          onClick={() => setShowBanknotes(true)}
        >
          <Banknote size={28} />
          <span>
            <strong>{totalApprovedStars} stjärnor</strong>
            <small>= {totalApprovedStars} kr</small>
          </span>
        </button>

        {showBanknotes && (
          <ChildBanknotesModal
            totalKronor={totalApprovedStars}
            onClose={() => setShowBanknotes(false)}
          />
        )}

        {activeReward && rewardProgress && (
          <div className="child-active-reward-mini">
            <Trophy size={16} />
            <span>{activeReward.title}</span>
            <small>{rewardProgress.starsLeft} stjärnor kvar</small>
          </div>
        )}

        <small className="child-stars-footnote">1 stjärna = 1 kr</small>
      </div>
    </div>
  );
}
