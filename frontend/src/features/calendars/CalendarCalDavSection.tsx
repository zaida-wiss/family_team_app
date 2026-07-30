import { useState } from "react";
import { Apple, RefreshCw, X } from "lucide-react";
import type { Calendar, Id } from "@shared/types";
import styles from "./CalendarPanel.module.css";

type AppleCalendarCandidate = { url: string; name: string };

type Props = {
  selectedCalendar: Calendar;
  canEdit: boolean;
  onListAppleCalendars: (accountEmail: string, appSpecificPassword: string) => Promise<AppleCalendarCandidate[]>;
  onConnectAppleCalDav: (calendarId: Id, accountEmail: string, appSpecificPassword: string, calendarUrl: string) => Promise<void>;
  onDisconnectCalDav: (calendarId: Id, connectionId: Id) => Promise<void>;
  onUpdateCalDavInterval: (calendarId: Id, connectionId: Id, syncIntervalMinutes: number) => Promise<void>;
  onSyncCalDavNow: (calendarId: Id, connectionId: Id) => Promise<void>;
};

// ADR-0027 (2026-07-24) — Fas 1: Apple CalDAV, tvåvägssynk. Google (Fas 2)
// väntar på att Zaida sätter upp ett Google Cloud-projekt, se ADR:n.
const SYNC_INTERVAL_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "Var 5:e minut" },
  { value: 15, label: "Var 15:e minut (standard)" },
  { value: 30, label: "Var 30:e minut" },
  { value: 60, label: "En gång i timmen" },
  { value: 240, label: "Var 4:e timme" },
];

export function CalendarCalDavSection({
  selectedCalendar,
  canEdit,
  onListAppleCalendars,
  onConnectAppleCalDav,
  onDisconnectCalDav,
  onUpdateCalDavInterval,
  onSyncCalDavNow,
}: Props) {
  const [accountEmail, setAccountEmail] = useState("");
  const [appSpecificPassword, setAppSpecificPassword] = useState("");
  // Kalenderväljaren (2026-07-30, Zaidas fråga: "gäller det samtliga
  // kalendrar jag har i icloud? kan jag få en enkel lista där jag väljer
  // vilka jag vill använda?") — tidigare anslöts alltid den FÖRSTA Apple-
  // kalendern som råkade komma tillbaka, utan att fråga. Nu ett mellansteg:
  // hämta listan, visa den, låt användaren välja EN (fortsatt bara en åt
  // gången per BMAD-kalender, ADR-0027s Fas 1-begränsning) innan anslutning.
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
    setListError(null);
    setListing(true);
    try {
      const found = await onListAppleCalendars(accountEmail.trim(), appSpecificPassword.trim());
      setCandidates(found);
      setSelectedUrl(found[0]?.url ?? "");
    } catch {
      setListError("Kunde inte hämta kalendrar — kontrollera Apple-ID och app-specifikt lösenord.");
      setCandidates(null);
    } finally {
      setListing(false);
    }
  }

  async function connect() {
    if (!selectedUrl) return;
    setConnectError(null);
    setConnecting(true);
    try {
      await onConnectAppleCalDav(selectedCalendar.id, accountEmail.trim(), appSpecificPassword.trim(), selectedUrl);
      setAccountEmail("");
      setAppSpecificPassword("");
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
    return (
      <div className={styles.importBlock}>
        <p className="eyebrow">Apple-kalender (tvåvägssynk)</p>
        <p className={styles.subIntervalHint}>
          Ändringar du gör i appen skrivs ut till din iCloud-kalender, och ändringar du gör där (t.ex. i iPhonens
          Kalender-app) hämtas hit igen. Du behöver ett app-specifikt lösenord — inte ditt vanliga Apple-ID-lösenord.{" "}
          <a href="https://support.apple.com/en-us/102654" rel="noreferrer" target="_blank">
            Så skapar du ett
          </a>
          .
        </p>
        <div className={styles.subForm}>
          <input
            className="text-input"
            disabled={candidates !== null}
            onChange={(e) => setAccountEmail(e.target.value)}
            placeholder="Apple-ID (e-post)"
            type="email"
            value={accountEmail}
          />
          <input
            className="text-input"
            disabled={candidates !== null}
            onChange={(e) => setAppSpecificPassword(e.target.value)}
            placeholder="App-specifikt lösenord"
            type="password"
            value={appSpecificPassword}
          />
          {listError && <small className={styles.subIntervalHint}>{listError}</small>}

          {candidates === null ? (
            <button
              className={`secondary-button ${styles.fullButton}`}
              disabled={!accountEmail.trim() || !appSpecificPassword.trim() || listing}
              onClick={() => void listCalendars()}
              type="button"
            >
              <Apple size={16} />
              {listing ? "Hämtar kalendrar…" : "Hämta mina kalendrar"}
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
                  <Apple size={16} />
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
          <span className={styles.subUrl}>{connection.accountEmailEnc}</span>
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
