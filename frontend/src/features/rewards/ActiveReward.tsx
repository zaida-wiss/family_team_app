import "./ActiveReward.css";
import { useEffect, useState } from "react";
import type { ActiveReward as ActiveRewardType } from "./useRewardShopState";

type Props = {
  reward: ActiveRewardType;
  onStartTimer: (itemId: string) => void;
  onDismiss: (itemId: string) => void;
};

function formatTime(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ActiveReward({ reward, onStartTimer, onDismiss }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (reward.timerEndsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [reward.timerEndsAt]);

  const timeLeft = reward.timerEndsAt !== null ? reward.timerEndsAt - now : null;
  const timerDone = timeLeft !== null && timeLeft <= 0;

  return (
    <div className={`active-reward${timerDone ? " active-reward--done" : ""}`}>
      <span className="active-reward__symbol">{reward.item.symbol ?? "🎁"}</span>
      <div className="active-reward__info">
        <span className="active-reward__title">{reward.item.title}</span>
        {timeLeft !== null && !timerDone && (
          <span className="active-reward__countdown">{formatTime(timeLeft)}</span>
        )}
        {timerDone && (
          <span className="active-reward__done-label">Tiden är slut!</span>
        )}
        {reward.item.timerMinutes !== null && reward.timerEndsAt === null && (
          <button
            className="active-reward__start-btn"
            onClick={() => onStartTimer(reward.item.id)}
          >
            Starta timer
          </button>
        )}
      </div>
      <button className="active-reward__close" onClick={() => onDismiss(reward.item.id)}>
        ✕
      </button>
    </div>
  );
}
