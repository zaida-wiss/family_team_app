import { useEffect, useState } from "react";
import { Apple, X } from "lucide-react";
import type { Id } from "@shared/types";
import type { AppleCalDavAccountSummary } from "../../api/calendars";
import styles from "./CalendarPanel.module.css";

type Props = {
  canManage: boolean;
  appleAccounts: AppleCalDavAccountSummary[];
  onRefreshAppleAccounts: () => Promise<AppleCalDavAccountSummary[]>;
  onAddAppleAccount: (accountEmail: string, appSpecificPassword: string) => Promise<AppleCalDavAccountSummary>;
  onRemoveAppleAccount: (appleAccountId: Id) => Promise<void>;
};

// 2026-07-30, Zaidas beslut: "tvåvägssynken med apple kontot skall inte
// fyllas i inuti någon kalender utan på en högre nivå så att sedan kalendrar
// kan använda sig av tvåvägssynkens olika kalendrar" — Apple-ID/lösenord
// loggas in EN gång här (kontonivå, oberoende av vald kalender). Varje
// enskild BMAD-kalenders CalendarCalDavSection.tsx väljer sedan bara bland
// dessa redan tillagda konton.
export function AppleCalDavAccountsSection({
  canManage,
  appleAccounts,
  onRefreshAppleAccounts,
  onAddAppleAccount,
  onRemoveAppleAccount,
}: Props) {
  const [accountEmail, setAccountEmail] = useState("");
  const [appSpecificPassword, setAppSpecificPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!canManage || loaded) return;
    setLoaded(true);
    void onRefreshAppleAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, loaded]);

  if (!canManage) return null;

  async function addAccount() {
    setConnectError(null);
    setConnecting(true);
    try {
      await onAddAppleAccount(accountEmail.trim(), appSpecificPassword.trim());
      setAccountEmail("");
      setAppSpecificPassword("");
    } catch {
      setConnectError("Kunde inte logga in mot Apple — kontrollera Apple-ID och app-specifikt lösenord.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <section className={styles.toolCard} aria-label="Apple-konton (tvåvägssynk)">
      <p className="eyebrow">🍎 Apple-konton</p>
      <small className={styles.subIntervalHint}>
        Logga in med ditt Apple-ID EN gång här — sedan kan valfri kalender nedan kopplas mot en av kontots
        iCloud-kalendrar utan att du behöver skriva in lösenordet igen. Du behöver ett app-specifikt lösenord —
        inte ditt vanliga Apple-ID-lösenord.{" "}
        <a href="https://support.apple.com/en-us/102654" rel="noreferrer" target="_blank">Så skapar du ett</a>.
      </small>

      {appleAccounts.length > 0 && (
        <ul className={styles.subForm}>
          {appleAccounts.map((acc) => (
            <li className={styles.subRow} key={acc.id}>
              <div className={styles.subInfo}>
                <span className={styles.subUrl}>{acc.accountEmail}</span>
                <small>Tillagd: {new Date(acc.connectedAt).toLocaleDateString("sv-SE")}</small>
              </div>
              <div className={styles.subActions}>
                <button
                  aria-label={`Ta bort Apple-kontot ${acc.accountEmail}`}
                  className="icon-button danger"
                  onClick={() => void onRemoveAppleAccount(acc.id)}
                  title="Ta bort Apple-konto"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.subForm}>
        <input
          className="text-input"
          onChange={(e) => setAccountEmail(e.target.value)}
          placeholder="Apple-ID (e-post)"
          type="email"
          value={accountEmail}
        />
        <input
          className="text-input"
          onChange={(e) => setAppSpecificPassword(e.target.value)}
          placeholder="App-specifikt lösenord"
          type="password"
          value={appSpecificPassword}
        />
        {connectError && <small className={styles.subIntervalHint}>{connectError}</small>}
        <button
          className={`secondary-button ${styles.fullButton}`}
          disabled={!accountEmail.trim() || !appSpecificPassword.trim() || connecting}
          onClick={() => void addAccount()}
          type="button"
        >
          <Apple size={16} />
          {connecting ? "Loggar in…" : "Lägg till Apple-konto"}
        </button>
      </div>
    </section>
  );
}
