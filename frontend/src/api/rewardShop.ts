import type { PurchasedReward, RewardShopItem } from "@shared/types";
import { api, request } from "./client";

export const rewardShopApi = {
  getItems: () => request<RewardShopItem[]>(api("reward-shop")),
  addItem: (item: RewardShopItem) =>
    request<{ ok: boolean }>(api("reward-shop/items"), {
      method: "POST",
      body: JSON.stringify(item),
    }),
  updateItem: (itemId: string, patch: Partial<Pick<RewardShopItem, "title" | "symbol" | "starCost" | "timerMinutes">>) =>
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
