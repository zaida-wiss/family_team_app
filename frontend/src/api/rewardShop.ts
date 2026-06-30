import type { PurchasedReward, RewardShopItem } from "@shared/types";
import { api, request } from "./client";

export type ShopResponse = { items: RewardShopItem[]; requireApprovalForCategories: boolean };

export const rewardShopApi = {
  getShop: () => request<ShopResponse>(api("reward-shop")),
  updateSettings: (patch: { requireApprovalForCategories?: boolean }) =>
    request<{ ok: boolean }>(api("reward-shop/settings"), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  addItem: (item: RewardShopItem) =>
    request<{ ok: boolean }>(api("reward-shop/items"), {
      method: "POST",
      body: JSON.stringify(item),
    }),
  updateItem: (itemId: string, patch: Partial<Pick<RewardShopItem, "title" | "symbol" | "starCost" | "timerMinutes" | "availability" | "requiredCategories">>) =>
    request<{ ok: boolean }>(api(`reward-shop/items/${itemId}`), {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  removeItem: (itemId: string) =>
    request<{ ok: boolean }>(api(`reward-shop/items/${itemId}`), { method: "DELETE" }),
  purchase: (itemId: string, forMemberId: string) =>
    request<PurchasedReward>(api(`reward-shop/purchase/${itemId}`), {
      method: "POST",
      body: JSON.stringify({ forMemberId }),
    }),
  getPurchased: () => request<PurchasedReward[]>(api("reward-shop/purchased")),
  movePurchased: (id: string, startsAt: string) =>
    request<{ ok: boolean }>(api(`reward-shop/purchased/${id}/move`), {
      method: "PATCH",
      body: JSON.stringify({ startsAt }),
    }),
  deletePurchased: (id: string) =>
    request<{ ok: boolean }>(api(`reward-shop/purchased/${id}`), { method: "DELETE" }),
};
