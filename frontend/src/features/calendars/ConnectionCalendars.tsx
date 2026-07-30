import { CalendarDays } from "lucide-react";
import { useConnectionCalendars } from "../accounts/useFamilyConnectionsState";
import { formatTimeRange } from "./calendarPanelHelpers";
import styles from "./CalendarPanel.module.css";

// Familjeanslutningar (ADR-0030-tillägg, 2026-07-30, Zaidas rättelse: "det
// räcker att man delat familjeanslutningen... det räcker att man är med i
// den") — skiljer sig från CrossAccountCalendars.tsx (samma PERSON, egna
// konton, synligt bara för den personen): här är det en HELT ANNAN familj
// som valt att exponera sina medlemmar, synligt för HELA min familj.
// Läsbart bara, nästa 30 dagar, samma mönster som ConnectionRecipesSection/
// ConnectionShoppingListsSection.
export function ConnectionCalendars() {
  const groups = useConnectionCalendars();

  const nonEmpty = groups.filter(
    (g) => Array.isArray(g?.calendars) && g.calendars.some((c) => Array.isArray(c?.events) && c.events.length > 0)
  );
  if (nonEmpty.length === 0) return null;

  return (
    <section className={styles.toolCard} aria-label="Kalendrar från anslutna familjer">
      <p className="eyebrow">📅 Kalendrar från anslutna familjer</p>
      <small>Nästa 30 dagar, läsbart.</small>
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
