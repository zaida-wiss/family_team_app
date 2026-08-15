import { useState } from "react";
import type { Member, Todo } from "@shared/types";
import { fmtTime } from "../calendars/calendarHelpers";
import { FamilyCompletedStats } from "./FamilyCompletedStats";
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
//
// Uppföljning samma dag (Zaida: "kunna se vem som utfört uppgifterna...
// hur många uppgifter familjen gjort för dagen", "följa över tid i en
// statistik"): listans gap borttaget, items.length som en synlig räknare,
// samt en expanderbar FamilyCompletedStats (lat-hämtad, bara vid
// utfällning) för trenden bakåt i tiden.
//
// Ytterligare en uppföljning, samma dag (Zaida: "det blev inte bra,
// medlemmens färg skall vara i bakgrunden på ikonen istället... Dels kall
// inte vara någon särskild bakgrund eller ens voarder för denna sektion.
// Även om det är en separat sektion så skall den flyta ihop med resten på
// sidan"): en första version satte assignee.color som en 3px bordercolor
// runt ikonen och gav sektionen ett eget mörkt kort-utseende (kopierat från
// ChildTimeline.css, se historiken) — ersatt med assignee.color som
// ikonens BAKGRUND (samma "member.color = identitet"-princip som
// FamilyTodoThreads.tsx/SubtaskAssigneeButton.tsx redan använder som
// bakgrund, inte kant) och sektionens egen bakgrund/börder/box-shadow
// borttagen helt (se FamilyCompletedTimeline.css) — sitter nu direkt på
// panelens delade sidbakgrund istället för att bryta av den.
export function FamilyCompletedTimeline({ todos, members }: Props) {
  const items = getFamilyCompletedTimelineItems(todos, new Date());
  const [statsOpen, setStatsOpen] = useState(false);

  return (
    <section aria-label="Familjens avklarade idag" className="family-completed-timeline">
      <div className="family-completed-timeline__header">
        <h3 className="family-completed-timeline__heading">Idag i familjen</h3>
        <span className="family-completed-timeline__count">{items.length}</span>
      </div>
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
                style={{ background: assignee?.color ?? "var(--primary)" }}
                title={`${item.title} — ${assignee?.name ?? "Familjen"}, ${fmtTime(item.completedAt)}`}
              >
                <span aria-hidden="true">{item.emoji ?? "✅"}</span>
              </li>
            );
          })}
        </ul>
      )}
      <button
        aria-expanded={statsOpen}
        className="family-completed-timeline__stats-toggle"
        onClick={() => setStatsOpen((open) => !open)}
        type="button"
      >
        {statsOpen ? "Dölj statistik" : "Visa statistik"}
      </button>
      {statsOpen && <FamilyCompletedStats />}
    </section>
  );
}
