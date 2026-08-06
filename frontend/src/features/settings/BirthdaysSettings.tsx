import "./BirthdaysSettings.css";
import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useBirthdaysState } from "./useBirthdaysState";
import { useConnectionBirthdays } from "../accounts/useFamilyConnectionsState";
import { sortByUpcomingBirthday, turningAge } from "./birthdayOrder";
import type { Birthday } from "@shared/types";

const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December"
];

const EMPTY_FORM = { name: "", month: "1", day: "", year: "" };

type MergedEntry = {
  key: string;
  name: string;
  month: number;
  day: number;
  year: number | null;
  source: string | null; // familjenamn om det kommer från en Familjeanslutning, annars null (eget)
  own: Birthday | null;
};

// Födelsedagslista (2026-08-06, Zaidas önskemål: "en lista över
// födelsedagar i inställningar... i datumordning med närmast dagens datum
// överst", sedan utökad: "man skall även kunna välja vilka familjer detta
// skall delas med" — se Inställningar → Familj → Familjeanslutningar för
// själva delningsvalet, ADR-0030). Egna OCH delade (från anslutna familjer
// med dataScope.birthdays på) sorteras ihop i EN lista.
export function BirthdaysSettings() {
  const { birthdays, loading, createBirthday, updateBirthday, removeBirthday } = useBirthdaysState();
  const connectionGroups = useConnectionBirthdays();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canSubmit = form.name.trim().length > 0 && form.day.trim().length > 0;

  const merged: MergedEntry[] = [
    ...birthdays.map((b) => ({ key: b.id, name: b.name, month: b.month, day: b.day, year: b.year, source: null, own: b })),
    ...connectionGroups.flatMap((g) =>
      g.birthdays.map((b) => ({
        key: `${g.accountId}-${b.id}`,
        name: b.name,
        month: b.month,
        day: b.day,
        year: b.year,
        source: g.accountName,
        own: null as Birthday | null
      }))
    )
  ];
  const sorted = sortByUpcomingBirthday(merged);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(entry: Birthday) {
    setForm({
      name: entry.name,
      month: String(entry.month),
      day: String(entry.day),
      year: entry.year != null ? String(entry.year) : ""
    });
    setEditingId(entry.id);
    setShowForm(true);
  }

  function submit() {
    if (!canSubmit) return;
    const input = {
      name: form.name.trim(),
      month: Number(form.month),
      day: Number(form.day),
      year: form.year.trim() ? Number(form.year) : null
    };
    if (editingId) {
      updateBirthday(editingId, input);
    } else {
      createBirthday(input);
    }
    setShowForm(false);
  }

  return (
    <div className="settings-sub birthdays-settings">
      <p className="empty-note">
        Datumordning, den som fyller år härnäst överst. Vill du dela listan med en annan familj, kryssa i
        Födelsedagar under Inställningar → Familj → Familjeanslutningar.
      </p>

      {loading ? (
        <p className="empty-note">Hämtar…</p>
      ) : sorted.length === 0 ? (
        <p className="empty-note">Inga födelsedagar sparade än.</p>
      ) : (
        <ul className="birthdays-settings__list">
          {sorted.map((entry) => {
            const age = turningAge(entry.year, entry.month, entry.day);
            return (
              <li className="birthdays-settings__row" key={entry.key}>
                <div className="birthdays-settings__info">
                  <strong>{entry.name}</strong>
                  <small>
                    {entry.day} {MONTHS[entry.month - 1]}
                    {age != null ? ` · fyller ${age} år` : ""}
                    {entry.source ? ` · ${entry.source}` : ""}
                  </small>
                </div>
                {entry.own && (
                  <div className="birthdays-settings__actions">
                    <button aria-label="Redigera" className="icon-button" onClick={() => startEdit(entry.own!)} type="button">
                      <Pencil size={14} />
                    </button>
                    {confirmDeleteId === entry.own.id ? (
                      <>
                        <button
                          className="secondary-button"
                          onClick={() => { removeBirthday(entry.own!.id); setConfirmDeleteId(null); }}
                          type="button"
                        >
                          Bekräfta
                        </button>
                        <button aria-label="Avbryt" className="icon-button" onClick={() => setConfirmDeleteId(null)} type="button">
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        aria-label="Radera"
                        className="icon-button danger"
                        onClick={() => setConfirmDeleteId(entry.own!.id)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!showForm && (
        <button className="secondary-button" onClick={startCreate} type="button">
          <Plus size={14} /> Ny födelsedag
        </button>
      )}

      {showForm && (
        <div className="birthdays-settings__form">
          <label className="field-label">
            Namn
            <input autoFocus className="text-input" onChange={(e) => setForm({ ...form, name: e.target.value })} value={form.name} />
          </label>
          <div className="birthdays-settings__form-row">
            <label className="field-label">
              Månad
              <select className="text-input" onChange={(e) => setForm({ ...form, month: e.target.value })} value={form.month}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Dag
              <input
                className="text-input"
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, day: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                value={form.day}
              />
            </label>
            <label className="field-label">
              År (valfritt)
              <input
                className="text-input"
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                value={form.year}
              />
            </label>
          </div>
          <div className="birthdays-settings__form-actions">
            <button className="secondary-button" onClick={() => setShowForm(false)} type="button">Avbryt</button>
            <button className="primary-button" disabled={!canSubmit} onClick={submit} type="button">Spara</button>
          </div>
        </div>
      )}
    </div>
  );
}
