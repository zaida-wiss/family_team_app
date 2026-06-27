import "./RewardShopModal.css";
import type { RewardShopItem } from "@shared/types";

type Props = {
  items: RewardShopItem[];
  availableStars: number;
  onPurchase: (item: RewardShopItem) => void;
  onClose: () => void;
};

export function RewardShopModal({ items, availableStars, onPurchase, onClose }: Props) {
  return (
    <div className="reward-shop-overlay" onClick={onClose}>
      <div className="reward-shop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reward-shop-modal__header">
          <span className="reward-shop-modal__title">🏪 Belöningsbutiken</span>
          <span className="reward-shop-modal__stars">⭐ {availableStars}</span>
          <button className="reward-shop-modal__close" onClick={onClose}>✕</button>
        </div>

        {items.length === 0 ? (
          <p className="reward-shop-modal__empty">Inga belöningar finns än.</p>
        ) : (
          <div className="reward-shop-modal__grid">
            {items.map((item) => {
              const canAfford = availableStars >= item.starCost;
              return (
                <button
                  key={item.id}
                  className={`reward-shop-card${canAfford ? "" : " reward-shop-card--locked"}`}
                  onClick={() => canAfford && onPurchase(item)}
                  disabled={!canAfford}
                >
                  <span className="reward-shop-card__symbol">{item.symbol ?? "🎁"}</span>
                  <span className="reward-shop-card__title">{item.title}</span>
                  <span className="reward-shop-card__cost">⭐ {item.starCost}</span>
                  {item.timerMinutes !== null && (
                    <span className="reward-shop-card__timer">⏱ {item.timerMinutes} min</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
