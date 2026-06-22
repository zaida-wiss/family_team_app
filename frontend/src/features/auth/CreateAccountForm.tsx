import { useState } from "react";

type Props = {
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

export function CreateAccountForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <p className="eyebrow">Nytt familjekonto</p>

      <label className="field-label">
        Familjens namn
        <input
          autoFocus
          className="text-input"
          onChange={(e) => setName(e.target.value)}
          placeholder="t.ex. Familjen Svensson"
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
