import "./RewardShopModal.css";
import type { PurchasedReward, RewardShopItem } from "@shared/types";

type Props = {
  items: RewardShopItem[];
  availableStars: number;
  purchased: PurchasedReward[];
  onPurchase: (item: RewardShopItem) => void;
  onClose: () => void;
};

export function RewardShopModal({ items, availableStars, purchased, onPurchase, onClose }: Props) {
  return (
    <div className="reward-shop-overlay" onClick={onClose}>
      <div className="reward-shop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reward-shop-modal__header">
          <span className="reward-shop-modal__title">🏪 Belöningsbutiken</span>
          <span className="reward-shop-modal__stars">⭐ {availableStars}</span>
          <button className="reward-shop-modal__close" onClick={onClose}>✕</button>
        </div>

        {purchased.length > 0 && (
          <div className="reward-shop-modal__active">
            {purchased.map((pr) => (
              <div key={pr.id} className="reward-shop-modal__purchased">
                <span className="reward-shop-modal__purchased-symbol">{pr.itemSymbol ?? "🎁"}</span>
                <span className="reward-shop-modal__purchased-title">{pr.itemTitle}</span>
                {pr.durationMinutes !== null && (
                  <span className="reward-shop-modal__purchased-meta">⏱ {pr.durationMinutes} min</span>
                )}
              </div>
            ))}
          </div>
        )}

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
