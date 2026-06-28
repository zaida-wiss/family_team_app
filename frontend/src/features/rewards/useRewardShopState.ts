import { useEffect, useState } from "react";
import { rewardShopApi } from "../../api";
import type { PurchasedReward, RewardShopItem } from "@shared/types";

export type { PurchasedReward };

export function useRewardShopState() {
  const [items, setItems] = useState<RewardShopItem[]>([]);
  const [purchased, setPurchased] = useState<PurchasedReward[]>([]);

  useEffect(() => {
    rewardShopApi.getItems().then(setItems).catch(console.error);
    rewardShopApi.getPurchased().then(setPurchased).catch(console.error);
  }, []);

  async function addItem(item: RewardShopItem) {
    await rewardShopApi.addItem(item);
    setItems((prev) => [...prev, item]);
  }

  async function removeItem(itemId: string) {
    await rewardShopApi.removeItem(itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function purchase(item: RewardShopItem, forMemberId: string) {
    const pr = await rewardShopApi.purchase(item.id, forMemberId);
    setPurchased((prev) => [...prev, pr]);
  }

  async function movePurchased(id: string, startsAt: string) {
    await rewardShopApi.movePurchased(id, startsAt);
    setPurchased((prev) =>
      prev.map((pr) => (pr.id === id ? { ...pr, startsAt } : pr))
    );
  }

  async function deletePurchased(id: string) {
    await rewardShopApi.deletePurchased(id);
    setPurchased((prev) => prev.filter((pr) => pr.id !== id));
  }

  return { items, purchased, addItem, removeItem, purchase, movePurchased, deletePurchased };
}
