import { useEffect, useState } from "react";
import { accountsApi } from "../../api";
import { accounts } from "../../data/sampleData";
import type { Account } from "@shared/types";

const FALLBACK_ACCOUNT_ID = "account-family-1";

export function useAccountState() {
  const [activeAccount, setActiveAccount] = useState<Account>(accounts[0]);

  useEffect(() => {
    accountsApi.get(FALLBACK_ACCOUNT_ID).then(setActiveAccount).catch(console.error);
  }, []);

  return { activeAccount, setActiveAccount };
}
