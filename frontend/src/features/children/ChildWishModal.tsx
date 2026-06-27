import { useState } from "react";
import { Star, Trophy, X } from "lucide-react";
import type { Id, Reward } from "@shared/types";
import "./ChildWishModal.css";

type Props = {
  childId: Id;
  approvedStarsTotal: number;
  childRewards: Reward[];
  nowMs: number;
  wishTitle: string;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: Id, starsNeeded: number) => void;
  onClose: () => void;
};

function isWithinLastDay(isoStr: string | null, now: number) {
  if (!isoStr) return false;
  const time = new Date(isoStr).getTime();
  return Number.isFinite(time) && now - time <= 86_400_000;
}

function getStatusLabel(status: Reward["status"]) {
  if (status === "active") return "Godkänd";
  if (status === "suggested") return "Väntar";
  if (status === "unlocked") return "Upplåst";
  if (status === "redeemed") return "Inlöst";
  return "Nekad";
}

const STATUS_ORDER: Record<Reward["status"], number> = {
  active: 0, unlocked: 1, redeemed: 2, suggested: 3, rejected: 4,
};

export function ChildWishModal({
  childId,
  approvedStarsTotal,
  childRewards,
  nowMs,
  wishTitle,
  onSetWishTitle,
  onCreateWish,
  onClose,
}: Props) {
  const [wishStars, setWishStars] = useState(10);

  const modalRewards = childRewards
    .filter((r) => (r.status === "rejected" ? isWithinLastDay(r.deletedAt, nowMs) : r.deletedAt === null))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title, "sv"));

  return (
    <div className="child-wish-modal-backdrop" onClick={onClose}>
      <section
        className="child-wish-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Barnets önskningar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="child-wish-modal-head">
          <div>
            <h3>Önskningar</h3>
            <p>
              <Star size={13} fill="currentColor" />
              {approvedStarsTotal} stjärnor totalt
            </p>
          </div>
          <button className="icon-button" type="button" aria-label="Stäng önskningar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="child-wish-modal-list">
          <form
            className="wish-form child-wish-form child-wish-modal-form"
            onSubmit={(e) => { e.preventDefault(); onCreateWish(childId, wishStars); }}
          >
            <input
              type="text"
              className="wish-form-input"
              value={wishTitle}
              onChange={(e) => onSetWishTitle(e.target.value)}
              placeholder="Jag önskar mig..."
              aria-label="Ny önskning"
            />
            <input
              type="number"
              className="wish-form-stars"
              value={wishStars}
              min={1}
              max={999}
              onChange={(e) => setWishStars(Math.max(1, parseInt(e.target.value, 10) || 1))}
              aria-label="Antal stjärnor"
            />
            <button className="wish-form-btn" type="submit">Önska</button>
          </form>

          {modalRewards.length === 0 ? (
            <p className="child-panel-empty">Inga önskningar ännu.</p>
          ) : (
            modalRewards.map((reward) => (
              <div key={reward.id} className={`child-wish-row child-wish-row--${reward.status}`}>
                <Trophy size={18} className="child-wish-trophy" />
                <div className="child-wish-info">
                  <span className="child-wish-title">{reward.title}</span>
                  <small>{reward.starsNeeded} stjärnor · {getStatusLabel(reward.status)}</small>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
