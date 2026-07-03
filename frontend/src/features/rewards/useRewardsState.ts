import { useEffect, useState } from "react";
import { rewardsApi } from "../../api";
import type { Id, Reward } from "@shared/types";
import { trackEvent } from "../../utils/analytics";

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
      symbol: null,
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
    trackEvent("wish-created");
    setRewards((current) => [...current, newReward]);
    if (titleOverride === undefined) {
      setWishTitle("");
    }
  }

  async function approveWish(rewardId: Id, approverId: Id) {
    const starsNeeded = wishStars[rewardId] ?? 10;

    // Sätt bara igång API-anropet om önskningen faktiskt fortfarande är suggested lokalt —
    // annars kan ett dubbelklick (knappen har ingen laddningsspärr) hinna skicka två
    // godkänn-anrop, där det andra får 404 av backend eftersom statusen redan bytt.
    let eligible = false;
    setRewards((current) =>
      current.map((r) => {
        if (r.id !== rewardId || r.status !== "suggested") return r;
        eligible = true;
        return {
          ...r,
          status: "active" as const,
          starsNeeded,
          approvedBy: approverId,
          approvedAt: new Date().toISOString()
        };
      })
    );
    if (!eligible) return;

    setWishStars((prev) => {
      const next = { ...prev };
      delete next[rewardId];
      return next;
    });

    try {
      await rewardsApi.approve(rewardId, starsNeeded);
      trackEvent("wish-approved");
    } catch (error) {
      console.error(error);
      // API-anropet misslyckades — återställ den optimistiska uppdateringen så UI inte
      // visar en godkänd önskning som aldrig faktiskt sparades på servern.
      setRewards((current) =>
        current.map((r) =>
          r.id === rewardId
            ? { ...r, status: "suggested" as const, approvedBy: null, approvedAt: null }
            : r
        )
      );
    }
  }

  function updateWish(rewardId: Id, patch: { title?: string; starsNeeded?: number; symbol?: string | null }) {
    rewardsApi.update(rewardId, patch).catch(console.error);
    setRewards((current) =>
      current.map((r) => (r.id === rewardId ? { ...r, ...patch } : r))
    );
  }

  async function rejectWish(rewardId: Id, rejecterId: Id) {
    let eligible = false;
    setRewards((current) =>
      current.map((r) => {
        if (r.id !== rewardId || r.status !== "suggested") return r;
        eligible = true;
        return {
          ...r,
          status: "rejected" as const,
          deletedAt: new Date().toISOString(),
          deletedBy: rejecterId
        };
      })
    );
    if (!eligible) return;

    try {
      await rewardsApi.reject(rewardId);
    } catch (error) {
      console.error(error);
      setRewards((current) =>
        current.map((r) =>
          r.id === rewardId ? { ...r, status: "suggested" as const, deletedAt: null, deletedBy: null } : r
        )
      );
    }
  }

  return { rewards, wishTitle, setWishTitle, createWish, wishStars, setWishStars, approveWish, rejectWish, updateWish };
}
