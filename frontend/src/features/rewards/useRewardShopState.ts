import { useEffect, useState } from "react";
import { rewardShopApi } from "../../api";
import type { RewardShopItem } from "@shared/types";

export type ActiveReward = {
  item: RewardShopItem;
  purchasedAt: number;
  timerEndsAt: number | null;
};

export function useRewardShopState() {
  const [items, setItems] = useState<RewardShopItem[]>([]);
  const [activeRewards, setActiveRewards] = useState<ActiveReward[]>([]);

  useEffect(() => {
    rewardShopApi.getItems().then(setItems).catch(console.error);
  }, []);

  async function addItem(item: RewardShopItem) {
    await rewardShopApi.addItem(item);
    setItems((prev) => [...prev, item]);
  }

  async function removeItem(itemId: string) {
    await rewardShopApi.removeItem(itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function purchase(item: RewardShopItem, onStarDeducted: (cost: number) => void) {
    await rewardShopApi.purchase(item.id);
    onStarDeducted(item.starCost);
    const active: ActiveReward = {
      item,
      purchasedAt: Date.now(),
      timerEndsAt: null,
    };
    setActiveRewards((prev) => [...prev, active]);
  }

  function startTimer(itemId: string) {
    setActiveRewards((prev) =>
      prev.map((ar) => {
        if (ar.item.id !== itemId || ar.item.timerMinutes === null) return ar;
        return { ...ar, timerEndsAt: Date.now() + ar.item.timerMinutes * 60 * 1000 };
      })
    );
  }

  function dismissReward(itemId: string) {
    setActiveRewards((prev) => prev.filter((ar) => ar.item.id !== itemId));
  }

  return { items, activeRewards, addItem, removeItem, purchase, startTimer, dismissReward };
}
