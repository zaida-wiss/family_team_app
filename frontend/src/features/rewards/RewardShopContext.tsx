import { createContext, useContext } from "react";

type RewardShopContextValue = {
  requireApprovalForCategories: boolean;
  updateSettings: (patch: { requireApprovalForCategories?: boolean }) => void;
};

export const RewardShopContext = createContext<RewardShopContextValue>({
  requireApprovalForCategories: false,
  updateSettings: () => {},
});

export function useRewardShopContext() {
  return useContext(RewardShopContext);
}
