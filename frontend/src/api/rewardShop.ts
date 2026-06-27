import type { RewardShopItem } from "@shared/types";
import { api, request } from "./client";

export const rewardShopApi = {
  getItems: () => request<RewardShopItem[]>(api("reward-shop")),
  addItem: (item: RewardShopItem) =>
    request<{ ok: boolean }>(api("reward-shop/items"), {
      method: "POST",
      body: JSON.stringify(item),
    }),
  removeItem: (itemId: string) =>
    request<{ ok: boolean }>(api(`reward-shop/items/${itemId}`), { method: "DELETE" }),
  purchase: (itemId: string) =>
    request<RewardShopItem>(api(`reward-shop/purchase/${itemId}`), {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
