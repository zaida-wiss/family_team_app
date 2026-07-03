import { createContext, useContext } from "react";
import type { RewardShopItem } from "@shared/types";

type RewardShopContextValue = {
  requireApprovalForCategories: boolean;
  updateSettings: (patch: { requireApprovalForCategories?: boolean }) => void;
  items: RewardShopItem[];
  // Ökas vid köp/flytt/borttag — konsumenter som cachar köpta belöningar per datum vet då att hämta om
  purchaseVersion: number;
  onPurchaseReward: (item: RewardShopItem, forMemberId: string) => Promise<void>;
};

export const RewardShopContext = createContext<RewardShopContextValue>({
  requireApprovalForCategories: false,
  updateSettings: () => {},
  items: [],
  purchaseVersion: 0,
  onPurchaseReward: async () => {},
});

export function useRewardShopContext() {
  return useContext(RewardShopContext);
}
