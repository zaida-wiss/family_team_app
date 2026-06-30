import { useEffect, useState } from "react";
import { rewardShopApi } from "../../api";
import { trackEvent } from "../../utils/analytics";
import type { PurchasedReward, RewardShopItem } from "@shared/types";

export type { PurchasedReward };

export function useRewardShopState() {
  const [items, setItems] = useState<RewardShopItem[]>([]);
  const [purchased, setPurchased] = useState<PurchasedReward[] | null>(null);
  const [requireApprovalForCategories, setRequireApprovalForCategories] = useState(false);

  useEffect(() => {
    rewardShopApi.getShop().then(({ items: shopItems, requireApprovalForCategories: raf }) => {
      setItems(shopItems);
      setRequireApprovalForCategories(raf);
    }).catch(console.error);
    rewardShopApi.getPurchased().then(setPurchased).catch(console.error);
  }, []);

  async function addItem(item: RewardShopItem) {
    await rewardShopApi.addItem(item);
    setItems((prev) => [...prev, item]);
  }

  async function updateSettings(patch: { requireApprovalForCategories?: boolean }) {
    await rewardShopApi.updateSettings(patch);
    if (patch.requireApprovalForCategories !== undefined) setRequireApprovalForCategories(patch.requireApprovalForCategories);
  }

  async function updateItem(itemId: string, patch: Partial<Pick<RewardShopItem, "title" | "symbol" | "starCost" | "timerMinutes">>) {
    await rewardShopApi.updateItem(itemId, patch);
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, ...patch } : i));
  }

  async function removeItem(itemId: string) {
    await rewardShopApi.removeItem(itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  async function purchase(item: RewardShopItem, forMemberId: string) {
    const pr = await rewardShopApi.purchase(item.id, forMemberId);
    trackEvent("reward-redeemed");
    setPurchased((prev) => [...(prev ?? []), pr]);
  }

  async function movePurchased(id: string, startsAt: string) {
    await rewardShopApi.movePurchased(id, startsAt);
    setPurchased((prev) =>
      (prev ?? []).map((pr) => (pr.id === id ? { ...pr, startsAt } : pr))
    );
  }

  async function deletePurchased(id: string) {
    await rewardShopApi.deletePurchased(id);
    setPurchased((prev) => (prev ?? []).filter((pr) => pr.id !== id));
  }

  return { items, purchased, requireApprovalForCategories, addItem, updateItem, updateSettings, removeItem, purchase, movePurchased, deletePurchased };
}
