import type { Member, Todo } from "@shared/types";
import { getFamilyWeekRoutines } from "./selectors";
import { startOfWeek } from "./recurringTodos";
import { toLocalDateStr } from "../calendars/calendarHelpers";
import "./FamilyWeekRoutines.css";

const WEEKDAY_LABELS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

type Props = {
  members: Member[];
  todos: Todo[];
};

// Hem-vyns nya "familjeläge"-standardvy (2026-08-29, Zaidas önskemål efter
// en mockup-bild av veckans rutiner): en rad per veckodag, en liten rad per
// familjemedlem inom varje dag — samma "member.color = identitet"-princip
// som FamilyCompletedTimeline.tsx redan använder (medlemmens färg som
// ikonens bakgrund, inte kant). Till skillnad från FamilyCompletedTimeline
// (som visar redan AVKLARADE uppgifter i turordning) visar denna hela
// veckans PLANERADE rutiner — en ogjord ikon dämpas mot bakgrunden istället
// för att döljas, en klar/godkänd ikon visas i full styrka. Se
// getFamilyWeekRoutines (selectors.ts) för hela urvalslogiken.
export function FamilyWeekRoutines({ members, todos }: Props) {
  const todayStr = toLocalDateStr(new Date());
  const days = getFamilyWeekRoutines(members, todos, startOfWeek(new Date()));
  const hasAnyRoutines = days.some((d) => d.memberRows.length > 0);

  if (!hasAnyRoutines) {
    return <p className="empty-note">Inga återkommande rutiner den här veckan ännu.</p>;
  }

  return (
    <div aria-label="Veckans rutiner" className="family-week-routines">
      {days.map((day, i) => {
        const isToday = day.dateStr === todayStr;
        return (
          <div
            className={`family-week-routines__day${isToday ? " family-week-routines__day--today" : ""}`}
            key={day.dateStr}
          >
            <div className="family-week-routines__day-header">
              <span>{WEEKDAY_LABELS[i]}</span>
              {isToday && <span className="family-week-routines__today-badge">Idag</span>}
            </div>
            {day.memberRows.length === 0 ? (
              <p className="empty-note">Inga rutiner denna dag.</p>
            ) : (
              day.memberRows.map((row) => {
                const member = members.find((m) => m.id === row.memberId);
                return (
                  <div className="family-week-routines__member-row" key={row.memberId}>
                    <span className="family-week-routines__member-name">{member?.name ?? "Okänd"}</span>
                    <div className="family-week-routines__icons">
                      {row.icons.map((icon) => (
                        <span
                          className={`family-week-routines__icon${icon.done ? " family-week-routines__icon--done" : ""}`}
                          key={icon.id}
                          style={{ background: member?.color ?? "var(--primary)" }}
                          title={`${icon.title} — ${member?.name ?? "Okänd"}${icon.done ? ", klart" : ", inte gjort än"}`}
                        >
                          <span aria-hidden="true">{icon.emoji ?? "⭐"}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
