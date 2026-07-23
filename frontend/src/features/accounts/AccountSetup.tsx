import { useState } from "react";
import { CreateAccountForm } from "../auth/CreateAccountForm";
import type { Account } from "@shared/types";

type AccountSetupProps = {
  account: Account;
  onUpdateAccount: (account: Account) => void;
  onCreateFamily: (name: string) => Promise<void>;
};

export function AccountSetup({ account, onUpdateAccount, onCreateFamily }: AccountSetupProps) {
  const [name, setName] = useState(account.name);
  const [creatingFamily, setCreatingFamily] = useState(false);

  function saveAccount() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onUpdateAccount({ ...account, name: trimmedName });
  }

  return (
    <>
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

      <div className="settings-sub">
        <h3 className="settings-sub-title">Ny familj</h3>
        <p className="settings-sub-desc">
          Du kan vara med i flera familjer samtidigt — byt mellan dem i hemvyn.
        </p>
        {creatingFamily ? (
          <CreateAccountForm
            onCancel={() => setCreatingFamily(false)}
            onSubmit={async (familyName) => {
              await onCreateFamily(familyName);
              setCreatingFamily(false);
            }}
          />
        ) : (
          <button className="secondary-button" onClick={() => setCreatingFamily(true)} type="button">
            Skapa ny familj
          </button>
        )}
      </div>
    </>
  );
}
