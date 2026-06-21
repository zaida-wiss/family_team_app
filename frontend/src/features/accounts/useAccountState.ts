import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { accounts } from "../../data/sampleData";
import type { Account } from "@shared/types";

export function useAccountState() {
  const [activeAccount, setActiveAccount] = useLocalStorageState<Account>(
    "family-team-app:active-account",
    accounts[0]
  );

  return { activeAccount, setActiveAccount };
}
