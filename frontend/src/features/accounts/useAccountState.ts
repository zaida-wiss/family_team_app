import { useState } from "react";
import { accountsApi } from "../../api";
import type { Account } from "@shared/types";

export function useAccountState(initial: Account) {
  const [activeAccount, setActiveAccount] = useState<Account>(initial);

  async function updateAccount(patch: Partial<Account>) {
    const updated = { ...activeAccount, ...patch };
    setActiveAccount(updated);
    await accountsApi.update(activeAccount.id, patch);
  }

  return { activeAccount, setActiveAccount: updateAccount };
}
