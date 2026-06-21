import { BriefcaseBusiness, Users } from "lucide-react";
import { useState } from "react";
import type { AccountType } from "@shared/types";

type Props = {
  onSubmit: (name: string, type: AccountType) => Promise<void>;
  onCancel: () => void;
};

export function CreateAccountForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("family");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit(name.trim(), type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="eyebrow">Nytt konto</p>

      <div className="account-type-picker">
        <button
          className={`account-type-option ${type === "family" ? "active" : ""}`}
          onClick={() => setType("family")}
          type="button"
        >
          <Users size={22} />
          Familj
        </button>
        <button
          className={`account-type-option ${type === "workplace" ? "active" : ""}`}
          onClick={() => setType("workplace")}
          type="button"
        >
          <BriefcaseBusiness size={22} />
          Arbetsplats
        </button>
      </div>

      <label className="field-label">
        {type === "family" ? "Familjens namn" : "Arbetsplatsens namn"}
        <input
          autoFocus
          className="text-input"
          onChange={(e) => setName(e.target.value)}
          placeholder={type === "family" ? "t.ex. Familjen Svensson" : "t.ex. Axel AB"}
          required
          type="text"
          value={name}
        />
      </label>

      {error && <p className="auth-error" role="alert">{error}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        <button className="primary-button" disabled={loading || !name.trim()} type="submit">
          {loading ? "…" : "Skapa konto"}
        </button>
        <button className="secondary-button" onClick={onCancel} type="button">
          Avbryt
        </button>
      </div>
    </form>
  );
}
