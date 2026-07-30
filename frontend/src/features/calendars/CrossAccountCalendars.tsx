import { CalendarDays } from "lucide-react";
import { useCrossAccountCalendars } from "./useCrossAccountCalendarsState";
import { formatTimeRange } from "./calendarPanelHelpers";
import styles from "./CalendarPanel.module.css";

// "Mina familjekonton" (2026-07-30, Zaidas önskemål: "alla privata
// kalendrar som jag skapat skall jag kunna dela med samtliga familjer jag
// är medlem i") — visar mina EGNA kalendrar (markerade med
// shareAcrossMyAccounts) från mina ANDRA konton, synligt bara för mig,
// aldrig andra medlemmar i de kontona. Läsbart, nästa 30 dagar (samma
// tidsfönster som Dela-barn-funktionens kalenderyta, 2026-07-27) — ingen
// redigering cross-account i denna omgång.
export function CrossAccountCalendars() {
  const { crossAccountCalendars } = useCrossAccountCalendars();

  // Skyddar mot ett oväntat/tomt svar (t.ex. en bredare API-mock i e2e-test
  // som råkar matcha den här endpointen också, eller ett äldre, ej
  // deployat backend som ännu inte känner till formen) — en trasig form ska
  // aldrig krascha hela Kalender-panelen, bara visa ingenting.
  const nonEmpty = crossAccountCalendars.filter(
    (t) => Array.isArray(t?.calendars) && t.calendars.some((c) => Array.isArray(c?.events) && c.events.length > 0)
  );
  if (nonEmpty.length === 0) return null;

  return (
    <section className={styles.toolCard} aria-label="Mina kalendrar i andra familjer">
      <p className="eyebrow">📅 Mina kalendrar i andra familjer</p>
      <small>Nästa 30 dagar, synligt bara för dig — ingen annan i dessa familjer ser detta.</small>
      {nonEmpty.map(({ accountId, accountName, calendars: cals }) => (
        <div key={accountId}>
          {cals
            .filter((c) => Array.isArray(c?.events) && c.events.length > 0)
            .map((cal) => (
              <div key={cal.id}>
                <small>{accountName} · {cal.name}</small>
                {cal.events.map((ev) => (
                  <div className="dashboard-row" key={ev.id}>
                    <CalendarDays size={18} />
                    <span>{ev.title}</span>
                    <strong>{formatTimeRange(ev.startsAt, ev.endsAt)}</strong>
                  </div>
                ))}
              </div>
            ))}
        </div>
      ))}
    </section>
  );
}
