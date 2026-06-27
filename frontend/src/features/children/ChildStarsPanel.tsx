import { Banknote, ShoppingBag, Star, Trophy } from "lucide-react";
import type { Reward, RewardPathProgress, Todo } from "@shared/types";
import "./ChildStarsPanel.css";
import "./ChildRewardRail.css";

type Props = {
  approvedStarsToday: number;
  totalApprovedStars: number;
  pendingApprovalTodos: Todo[];
  activeReward: Reward | null;
  rewardProgress: RewardPathProgress | null;
  onOpenShop: () => void;
};

export function ChildStarsPanel({
  approvedStarsToday,
  totalApprovedStars,
  pendingApprovalTodos,
  activeReward,
  rewardProgress,
  onOpenShop,
}: Props) {
  return (
    <div className="child-bottom-panels">
      <div className="child-stars-panel">
        {pendingApprovalTodos.length > 0 && (
          <div className="child-pending-symbols" aria-label="Väntar på godkännande">
            {pendingApprovalTodos.map((todo) => (
              <span className="child-pending-symbol" key={todo.id} title={todo.title}>
                {todo.visual.value}
              </span>
            ))}
          </div>
        )}

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

        <div
          className="child-money-card"
          aria-label={`${totalApprovedStars} stjärnor är ${totalApprovedStars} kronor`}
        >
          <Banknote size={28} />
          <span>
            <strong>{totalApprovedStars} stjärnor</strong>
            <small>= {totalApprovedStars} kr</small>
          </span>
        </div>

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
