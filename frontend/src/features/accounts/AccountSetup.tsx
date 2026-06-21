import { BriefcaseBusiness, Users } from "lucide-react";
import { useState } from "react";
import type { Account, AccountType } from "@shared/types";

type AccountSetupProps = {
  account: Account;
  onUpdateAccount: (account: Account) => void;
};

export function AccountSetup({ account, onUpdateAccount }: AccountSetupProps) {
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<AccountType>(account.type);

  function saveAccount() {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    onUpdateAccount({
      ...account,
      name: trimmedName,
      type
    });
  }

  return (
    <article className="account-setup">
      <div>
        <p className="eyebrow">Kontostart</p>
        <h2>Välj hur kontot ska användas</h2>
      </div>

      <label className="field-label">
        Kontonamn
        <input
          className="text-input"
          onChange={(event) => setName(event.target.value)}
          placeholder="Till exempel Familjen Solbacken"
          value={name}
        />
      </label>

      <div className="account-type-grid" role="group" aria-label="Kontotyp">
        <button
          className={`account-type-button ${type === "family" ? "active" : ""}`}
          onClick={() => setType("family")}
          type="button"
        >
          <Users size={22} />
          <span>
            <strong>Familj</strong>
            <small>Barnkonton, stjärnor och belöningsbana</small>
          </span>
        </button>

        <button
          className={`account-type-button ${type === "workplace" ? "active" : ""}`}
          onClick={() => setType("workplace")}
          type="button"
        >
          <BriefcaseBusiness size={22} />
          <span>
            <strong>Arbetsplats</strong>
            <small>Medlemmar, roller, kalender, todo och inköp</small>
          </span>
        </button>
      </div>

      <button className="primary-button" onClick={saveAccount} type="button">
        Spara konto
      </button>
    </article>
  );
}
