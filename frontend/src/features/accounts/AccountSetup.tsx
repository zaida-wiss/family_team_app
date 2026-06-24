import { useState } from "react";
import type { Account } from "@shared/types";

type AccountSetupProps = {
  account: Account;
  onUpdateAccount: (account: Account) => void;
};

export function AccountSetup({ account, onUpdateAccount }: AccountSetupProps) {
  const [name, setName] = useState(account.name);

  function saveAccount() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onUpdateAccount({ ...account, name: trimmedName });
  }

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">Kontonamn</h3>
      <label className="field-label">
        Familjens namn
        <input
          className="text-input"
          onChange={(event) => setName(event.target.value)}
          placeholder="t.ex. Familjen Solbacken"
          value={name}
        />
      </label>
      <button className="primary-button" onClick={saveAccount} type="button">
        Spara
      </button>
    </div>
  );
}
