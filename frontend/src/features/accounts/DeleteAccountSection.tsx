import { useState } from "react";
import { accountsApi } from "../../api";
import authStyles from "../auth/Auth.module.css";

type Props = {
  accountId: string;
  accountName: string;
  onConfirm: () => Promise<void>;
};

export function DeleteAccountSection({ accountId, accountName, onConfirm }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    try {
      const data = await accountsApi.export(accountId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bmad-data-${accountName.replace(/\s+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda ner data");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
      setLoading(false);
    }
  }

  return (
    <article className="dashboard danger-zone">
      <header className="section-header">
        <div>
          <p className="eyebrow">GDPR · Artikel 17 &amp; 20</p>
          <h2>Ta bort familjekonto</h2>
        </div>
      </header>

      <p className="delete-account-intro">
        Innan du tar bort kontot kan du ladda ner all din data (GDPR Art. 20 – rätten
        till dataportabilitet).
      </p>

      <button
        className="ghost-button"
        disabled={downloading}
        onClick={handleDownload}
        type="button"
      >
        {downloading ? "Förbereder…" : "Ladda ner min data (.json)"}
      </button>

      {!expanded ? (
        <button
          className="danger-button"
          onClick={() => setExpanded(true)}
          style={{ marginTop: "0.5rem" }}
          type="button"
        >
          Ta bort konto…
        </button>
      ) : (
        <div className="delete-account-confirm">
          <p>
            Du håller på att ta bort kontot <strong>{accountName}</strong>.
            Läs igenom vad som händer:
          </p>
          <ul className="delete-account-consequences">
            <li>Alla familjemedlemmar förlorar omedelbart åtkomst.</li>
            <li>Todos, kalender, inköpslistor och belöningar tas bort.</li>
            <li>
              Enligt GDPR Art. 17 (rätten att bli glömd) raderas personuppgifterna
              definititivt inom 30 dagar. Ingen återhämtning är möjlig efter det.
            </li>
            <li>Åtgärden kan inte ångras.</li>
          </ul>

          <label className="delete-account-checkbox">
            <input
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              type="checkbox"
            />
            Jag förstår att kontot och all data raderas permanent
          </label>

          {error && <p className={authStyles.error} role="alert">{error}</p>}

          <div className="delete-account-actions">
            <button
              className="ghost-button"
              disabled={loading}
              onClick={() => { setExpanded(false); setConfirmed(false); setError(null); }}
              type="button"
            >
              Avbryt
            </button>
            <button
              className="danger-button"
              disabled={!confirmed || loading}
              onClick={handleDelete}
              type="button"
            >
              {loading ? "Raderar…" : "Bekräfta radering"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
