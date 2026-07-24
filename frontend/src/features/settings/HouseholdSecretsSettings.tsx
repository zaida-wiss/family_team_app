import "./HouseholdSecretsSettings.css";
import { useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useHouseholdSecretsState } from "./useHouseholdSecretsState";
import type { HouseholdSecretEntry } from "../../api/householdSecrets";
import type { HouseholdSecretKind } from "@shared/types";

type Props = {
  kind: HouseholdSecretKind;
};

const EMPTY_FORM = { title: "", username: "", secret: "", notes: "", cost: "", renewalDate: "" };

// Hushållets lösenord + abonnemang (2026-07-25, Zaidas önskemål) — samma
// komponent återanvänd för båda "kategorierna" i Inställningar, filtrerad
// på kind. Krypteringsmodellen (servernyckel, samma som övrig appdata,
// INTE en riktig nolltillitslösning) är Zaidas uttryckliga val — se
// HouseholdSecret i shared/types.ts för fullständig dokumentation.
export function HouseholdSecretsSettings({ kind }: Props) {
  const { secrets, loading, createSecret, updateSecret, removeSecret } = useHouseholdSecretsState();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const entries = secrets.filter((s) => s.kind === kind);
  const isSubscription = kind === "subscription";
  const canSubmit = form.title.trim().length > 0 && form.secret.trim().length > 0;

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(entry: HouseholdSecretEntry) {
    setForm({
      title: entry.title,
      username: entry.username ?? "",
      secret: entry.secret,
      notes: entry.notes ?? "",
      cost: entry.cost != null ? String(entry.cost) : "",
      renewalDate: entry.renewalDate ?? ""
    });
    setEditingId(entry.id);
    setShowForm(true);
  }

  function submit() {
    if (!canSubmit) return;
    const input = {
      kind,
      title: form.title.trim(),
      username: form.username.trim() || null,
      secret: form.secret,
      notes: form.notes.trim() || null,
      cost: form.cost ? Number(form.cost) : null,
      renewalDate: form.renewalDate || null
    };
    if (editingId) {
      updateSecret(editingId, input);
    } else {
      createSecret(input);
    }
    setShowForm(false);
  }

  function toggleReveal(id: string) {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="settings-sub household-secrets">
      <p className="empty-note">
        Krypterat i databasen med samma nyckel som resten av appens innehåll — inte en fristående
        lösenordshanterare där bara ni har nyckeln. Ingår aldrig i GDPR-exporten.
      </p>

      {loading ? (
        <p className="empty-note">Hämtar…</p>
      ) : entries.length === 0 ? (
        <p className="empty-note">Inga {isSubscription ? "abonnemang" : "lösenord"} sparade än.</p>
      ) : (
        <ul className="household-secrets__list">
          {entries.map((entry) => (
            <li className="household-secrets__row" key={entry.id}>
              <div className="household-secrets__info">
                <strong>{entry.title}</strong>
                {entry.username && <small>{entry.username}</small>}
                {isSubscription && (entry.cost != null || entry.renewalDate) && (
                  <small>
                    {entry.cost != null ? `${entry.cost} kr` : ""}
                    {entry.cost != null && entry.renewalDate ? " · " : ""}
                    {entry.renewalDate ? `Förnyas ${entry.renewalDate}` : ""}
                  </small>
                )}
                <small className="household-secrets__secret">
                  {revealedIds.has(entry.id) ? entry.secret : "••••••••"}
                </small>
              </div>
              <div className="household-secrets__actions">
                <button
                  aria-label={revealedIds.has(entry.id) ? "Dölj" : "Visa"}
                  className="icon-button"
                  onClick={() => toggleReveal(entry.id)}
                  type="button"
                >
                  {revealedIds.has(entry.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button aria-label="Redigera" className="icon-button" onClick={() => startEdit(entry)} type="button">
                  <Pencil size={14} />
                </button>
                {confirmDeleteId === entry.id ? (
                  <>
                    <button className="secondary-button" onClick={() => { removeSecret(entry.id); setConfirmDeleteId(null); }} type="button">
                      Bekräfta
                    </button>
                    <button aria-label="Avbryt" className="icon-button" onClick={() => setConfirmDeleteId(null)} type="button">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <button aria-label="Radera" className="icon-button danger" onClick={() => setConfirmDeleteId(entry.id)} type="button">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showForm && (
        <button className="secondary-button" onClick={startCreate} type="button">
          <Plus size={14} /> {isSubscription ? "Nytt abonnemang" : "Nytt lösenord"}
        </button>
      )}

      {showForm && (
        <div className="household-secrets__form">
          <label className="field-label">
            {isSubscription ? "Tjänst" : "Namn"}
            <input autoFocus className="text-input" onChange={(e) => setForm({ ...form, title: e.target.value })} value={form.title} />
          </label>
          {!isSubscription && (
            <label className="field-label">
              Användarnamn
              <input className="text-input" onChange={(e) => setForm({ ...form, username: e.target.value })} value={form.username} />
            </label>
          )}
          <label className="field-label">
            {isSubscription ? "Kontoinfo / inloggning" : "Lösenord"}
            <input className="text-input" onChange={(e) => setForm({ ...form, secret: e.target.value })} value={form.secret} />
          </label>
          {isSubscription && (
            <>
              <label className="field-label">
                Kostnad (kr)
                <input className="text-input" inputMode="numeric" onChange={(e) => setForm({ ...form, cost: e.target.value.replace(/\D/g, "") })} value={form.cost} />
              </label>
              <label className="field-label">
                Förnyas
                <input className="text-input" onChange={(e) => setForm({ ...form, renewalDate: e.target.value })} type="date" value={form.renewalDate} />
              </label>
            </>
          )}
          <label className="field-label">
            Anteckningar
            <textarea className="text-input" onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} value={form.notes} />
          </label>
          <div className="household-secrets__form-actions">
            <button className="secondary-button" onClick={() => setShowForm(false)} type="button">Avbryt</button>
            <button className="primary-button" disabled={!canSubmit} onClick={submit} type="button">Spara</button>
          </div>
        </div>
      )}
    </div>
  );
}
