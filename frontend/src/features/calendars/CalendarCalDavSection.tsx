import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { Calendar, Id } from "@shared/types";
import type { AppleCalDavAccountSummary } from "../../api/calendars";
import styles from "./CalendarPanel.module.css";

type AppleCalendarCandidate = { url: string; name: string };

type Props = {
  selectedCalendar: Calendar;
  canEdit: boolean;
  appleAccounts: AppleCalDavAccountSummary[];
  onListCalendarsForAppleAccount: (appleAccountId: Id) => Promise<AppleCalendarCandidate[]>;
  onConnectAppleCalDav: (calendarId: Id, appleAccountId: Id, calendarUrl: string) => Promise<void>;
  onDisconnectCalDav: (calendarId: Id, connectionId: Id) => Promise<void>;
  onUpdateCalDavInterval: (calendarId: Id, connectionId: Id, syncIntervalMinutes: number) => Promise<void>;
  onSyncCalDavNow: (calendarId: Id, connectionId: Id) => Promise<void>;
};

const SYNC_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "Var 5:e minut" },
  { value: 15, label: "Var 15:e minut (standard)" },
  { value: 30, label: "Var 30:e minut" },
  { value: 60, label: "En gång i timmen" },
  { value: 240, label: "Var 4:e timme" },
];

// 2026-07-30, Zaidas beslut: "tvåvägssynken med apple kontot skall inte
// fyllas i inuti någon kalender utan på en högre nivå så att sedan
// kalendrar kan använda sig av tvåvägssynkens olika kalendrar" — Apple-ID
// och lösenord skrivs numera in EN gång i AppleCalDavAccountsSection.tsx
// (Inställningar → Kalendrar, oberoende av vald kalender). Den HÄR
// komponenten väljer bara BLAND redan tillagda konton + vilken av kontots
// Apple-kalendrar just DEN valda BMAD-kalendern ska kopplas till.
export function CalendarCalDavSection({
  selectedCalendar,
  canEdit,
  appleAccounts,
  onListCalendarsForAppleAccount,
  onConnectAppleCalDav,
  onDisconnectCalDav,
  onUpdateCalDavInterval,
  onSyncCalDavNow,
}: Props) {
  const [selectedAppleAccountId, setSelectedAppleAccountId] = useState(appleAccounts[0]?.id ?? "");
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AppleCalendarCandidate[] | null>(null);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  if (!canEdit) return null;

  const connection = (selectedCalendar.calDavConnections ?? [])[0] ?? null;

  async function listCalendars() {
    if (!selectedAppleAccountId) return;
    setListError(null);
    setListing(true);
    try {
      const found = await onListCalendarsForAppleAccount(selectedAppleAccountId);
      setCandidates(found);
      setSelectedUrl(found[0]?.url ?? "");
    } catch {
      setListError("Kunde inte hämta kalendrar från Apple-kontot.");
      setCandidates(null);
    } finally {
      setListing(false);
    }
  }

  async function connect() {
    if (!selectedUrl || !selectedAppleAccountId) return;
    setConnectError(null);
    setConnecting(true);
    try {
      await onConnectAppleCalDav(selectedCalendar.id, selectedAppleAccountId, selectedUrl);
      setCandidates(null);
      setSelectedUrl("");
    } catch {
      setConnectError("Kunde inte ansluta — kalendern kanske inte längre finns på Apple-kontot.");
    } finally {
      setConnecting(false);
    }
  }

  function resetChoice() {
    setCandidates(null);
    setSelectedUrl("");
    setListError(null);
  }

  if (!connection) {
    if (appleAccounts.length === 0) {
      return (
        <div className={styles.importBlock}>
          <p className="eyebrow">Apple-kalender (tvåvägssynk)</p>
          <small className={styles.subIntervalHint}>
            Lägg till ett Apple-konto ovan innan du kan koppla den här kalendern till iCloud.
          </small>
        </div>
      );
    }

    return (
      <div className={styles.importBlock}>
        <p className="eyebrow">Apple-kalender (tvåvägssynk)</p>
        <div className={styles.subForm}>
          <label className={styles.subIntervalLabel}>
            Apple-konto
            <select
              className="text-input"
              disabled={candidates !== null}
              onChange={(e) => { setSelectedAppleAccountId(e.target.value); resetChoice(); }}
              value={selectedAppleAccountId}
            >
              {appleAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.accountEmail}</option>
              ))}
            </select>
          </label>
          {listError && <small className={styles.subIntervalHint}>{listError}</small>}

          {candidates === null ? (
            <button
              className={`secondary-button ${styles.fullButton}`}
              disabled={!selectedAppleAccountId || listing}
              onClick={() => void listCalendars()}
              type="button"
            >
              {listing ? "Hämtar kalendrar…" : "Hämta kalendrar från kontot"}
            </button>
          ) : (
            <>
              <label className={styles.subIntervalLabel}>
                Vilken kalender vill du ansluta?
                <select
                  className="text-input"
                  onChange={(e) => setSelectedUrl(e.target.value)}
                  value={selectedUrl}
                >
                  {candidates.map((c) => (
                    <option key={c.url} value={c.url}>{c.name}</option>
                  ))}
                </select>
              </label>
              <small className={styles.subIntervalHint}>
                Bara denna ena kalender ansluts — dina övriga iCloud-kalendrar påverkas inte.
              </small>
              {connectError && <small className={styles.subIntervalHint}>{connectError}</small>}
              <div className={styles.subActions}>
                <button className="ghost-button" onClick={resetChoice} type="button">
                  Avbryt
                </button>
                <button
                  className={`secondary-button ${styles.fullButton}`}
                  disabled={!selectedUrl || connecting}
                  onClick={() => void connect()}
                  type="button"
                >
                  {connecting ? "Ansluter…" : "Anslut vald kalender"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.importBlock}>
      <p className="eyebrow">Apple-kalender (tvåvägssynk)</p>
      <div className={styles.subRow}>
        <div className={styles.subInfo}>
          <span className={styles.subUrl}>
            {appleAccounts.find((a) => a.id === connection.appleAccountId)?.accountEmail ?? "Okänt Apple-konto"}
          </span>
          {connection.lastSyncedAt && (
            <small>Senast synkad: {new Date(connection.lastSyncedAt).toLocaleString("sv-SE")}</small>
          )}
          {connection.lastSyncError && <small>⚠️ {connection.lastSyncError}</small>}
          <label className={styles.subIntervalLabel}>
            Synkintervall
            <select
              className="text-input"
              onChange={(e) => void onUpdateCalDavInterval(selectedCalendar.id, connection.id, Number(e.target.value))}
              value={connection.syncIntervalMinutes}
            >
              {SYNC_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <small className={styles.subIntervalHint}>
            Kortare intervall känns snabbare men innebär fler anrop mot Apple — för täta anrop kan uppfattas som
            missbruk och riskera att anslutningen stängs av. Synkningen sker på appens server, inte på din telefon —
            det spelar ingen roll om du har roaming eller begränsad mobildata.
          </small>
        </div>
        <div className={styles.subActions}>
          <button
            aria-label="Synka Apple-kalender nu"
            className="icon-button"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              try { await onSyncCalDavNow(selectedCalendar.id, connection.id); } finally { setSyncing(false); }
            }}
            title="Synka nu"
            type="button"
          >
            <RefreshCw size={14} className={syncing ? "spin" : undefined} />
          </button>
          <button
            aria-label="Koppla bort Apple-kalender"
            className="icon-button danger"
            onClick={() => void onDisconnectCalDav(selectedCalendar.id, connection.id)}
            title="Koppla bort"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
