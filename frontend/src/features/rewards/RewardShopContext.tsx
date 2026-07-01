import { createContext, useContext } from "react";
import type { PurchasedReward, RewardShopItem } from "@shared/types";

type RewardShopContextValue = {
  requireApprovalForCategories: boolean;
  updateSettings: (patch: { requireApprovalForCategories?: boolean }) => void;
  items: RewardShopItem[];
  purchased: PurchasedReward[] | null;
  onPurchaseReward: (item: RewardShopItem, forMemberId: string) => Promise<void>;
};

export const RewardShopContext = createContext<RewardShopContextValue>({
  requireApprovalForCategories: false,
  updateSettings: () => {},
  items: [],
  purchased: null,
  onPurchaseReward: async () => {},
});

export function useRewardShopContext() {
  return useContext(RewardShopContext);
}
