import { useEffect, useState } from "react";
import { rewardsApi } from "../../api";
import type { Id, Reward } from "@shared/types";

export function useRewardsState() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [wishTitle, setWishTitle] = useState("");
  const [wishStars, setWishStars] = useState<Record<Id, number>>({});

  useEffect(() => {
    rewardsApi.getAll().then(setRewards).catch(console.error);
  }, []);

  function createWish(childId: Id, starsNeeded = 10, titleOverride?: string) {
    const title = (titleOverride ?? wishTitle).trim();
    if (!title) return;

    const newReward: Reward = {
      id: `reward-${Date.now()}`,
      title,
      wishedBy: childId,
      starsNeeded,
      status: "suggested",
      approvedBy: null,
      approvedAt: null,
      redeemedAt: null,
      deletedAt: null,
      deletedBy: null
    };

    rewardsApi.create(newReward).catch(console.error);
    setRewards((current) => [...current, newReward]);
    if (titleOverride === undefined) {
      setWishTitle("");
    }
  }

  function approveWish(rewardId: Id, approverId: Id) {
    const starsNeeded = wishStars[rewardId] ?? 10;

    rewardsApi.approve(rewardId, starsNeeded).catch(console.error);
    setRewards((current) =>
      current.map((r) => {
        if (r.id !== rewardId || r.status !== "suggested") return r;
        return {
          ...r,
          status: "active" as const,
          starsNeeded,
          approvedBy: approverId,
          approvedAt: new Date().toISOString()
        };
      })
    );
    setWishStars((prev) => {
      const next = { ...prev };
      delete next[rewardId];
      return next;
    });
  }

  function rejectWish(rewardId: Id, rejecterId: Id) {
    rewardsApi.reject(rewardId).catch(console.error);
    setRewards((current) =>
      current.map((r) => {
        if (r.id !== rewardId || r.status !== "suggested") return r;
        return {
          ...r,
          status: "rejected" as const,
          deletedAt: new Date().toISOString(),
          deletedBy: rejecterId
        };
      })
    );
  }

  return { rewards, wishTitle, setWishTitle, createWish, wishStars, setWishStars, approveWish, rejectWish };
}
