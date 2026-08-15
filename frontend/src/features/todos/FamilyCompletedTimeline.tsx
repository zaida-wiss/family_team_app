import type { Member, Todo } from "@shared/types";
import { fmtTime } from "../calendars/calendarHelpers";
import { getFamilyCompletedTimelineItems } from "./selectors";
import "./FamilyCompletedTimeline.css";

type Props = {
  todos: Todo[];
  members: Member[];
};

// Hela familjens gemensamt avklarade dag, som ikoner i turordning (2026-08-15,
// Zaida: "Tidslinjen gör höjden för hög. Ta bort tidslinjen och låt ikonerna
// komma i turordning och gå i läsordning i den ordning som familjen avklarar
// uppgifter" — uppföljning av gårdagens vågräta tidslinje-version, som blev
// för hög p.g.a. timmarkeringar/nu-linje/staplingsmatematiken). En vanlig
// <ul> i läsordning istället för tidsbaserad absolut positionering — samma
// "avklarat"-definition som ChildTimeline.tsx (status done ELLER approved,
// inte bara godkänt), samma "alla todos som skickas in" som förut, barnens
// inräknat — se getFamilyCompletedTimelineItems (todos/selectors.ts), som
// redan sorterar stigande på completedAt.
export function FamilyCompletedTimeline({ todos, members }: Props) {
  const items = getFamilyCompletedTimelineItems(todos, new Date());

  return (
    <section aria-label="Familjens avklarade idag" className="family-completed-timeline">
      <h3 className="family-completed-timeline__heading">Idag i familjen</h3>
      {items.length === 0 ? (
        <p className="empty-note">Inget avklarat än idag.</p>
      ) : (
        <ul className="family-completed-timeline__list">
          {items.map((item) => {
            const assignee = members.find((m) => m.id === item.assigneeId);
            return (
              <li
                className="family-completed-timeline__icon"
                key={item.id}
                title={`${item.title} — ${assignee?.name ?? "Familjen"}, ${fmtTime(item.completedAt)}`}
              >
                <span aria-hidden="true">{item.emoji ?? "✅"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
