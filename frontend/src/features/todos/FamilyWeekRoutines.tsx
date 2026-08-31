import type { Calendar, Member, TodoCategory, Todo } from "@shared/types";
import { getFamilyWeekRoutines } from "./selectors";
import { startOfLocalDay } from "./recurringTodos";
import { getFamilyWeekCalendarEvents, toLocalDateStr } from "../calendars/calendarHelpers";
import { isoToTimeInput } from "../../utils/fixedTimeZone";
import "./FamilyWeekRoutines.css";

const WEEKDAY_LABEL_FORMAT = new Intl.DateTimeFormat("sv-SE", { weekday: "long" });
const DATE_LABEL_FORMAT = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Props = {
  members: Member[];
  todos: Todo[];
  calendars: Calendar[];
  categories?: TodoCategory[];
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
//
// 2026-08-30, tre uppföljande Zaida-önskemål i samma runda: (1) en kategori
// vars uppgifter återkommer VARJE dag (t.ex. en egen "Rutiner"-kategori)
// flödar ihop och tar onödig plats — TodoCategory.excludeFromWeekOverview
// togglas i Inställningar → Familj → Dashboard (ny underkategori,
// SettingsContent.tsx), inte här inline; den här komponenten läser bara
// redan-filtrerade `categories` via getFamilyWeekRoutines (selectors.ts).
// (2) "nu flyter veckan ihop" — dagarna fick en tydlig avdelare + kort
// datum bredvid veckodagsnamnet, och dagens rad en egen bakgrundston (inte
// bara en kantlinje som tidigare). (3) ikonerna halverade i storlek,
// uttryckligt för att få plats med alla sju dagar samtidigt utan skroll.
//
// 2026-08-30, ytterligare ett Zaida-önskemål samma dag: "dagens datum skall
// alltid vara högst upp" — vyn visade tidigare en FAST måndag-söndag-vecka
// (weekStart = startOfWeek(nu)) med dagens datum bara MARKERAT någonstans i
// listan, ofta långt ner om det råkade vara t.ex. fredag. Bytt till ett
// rullande fönster som alltid börjar på dagens datum (weekStart =
// startOfLocalDay(nu)) — dag 0 är alltid idag. Veckodagsnamnet kan därför
// inte längre slås upp i ett fast måndag-först-index (WEEKDAY_LABELS), utan
// beräknas per faktiskt datum via Intl.DateTimeFormat.
//
// 2026-08-31, Zaida: "istället för kommande vecka vill jag se idag och
// ytterligare två dagar fram" — getFamilyWeekRoutines/getFamilyWeekCalendarEvents
// fick båda ett `days`-defaultvärde på 3 (var 7), anropas här oförändrat
// utan ett explicit tredje/fjärde argument.
export function FamilyWeekRoutines({ members, todos, calendars, categories = [] }: Props) {
  const todayStr = toLocalDateStr(new Date());
  const weekStart = startOfLocalDay(new Date());
  const days = getFamilyWeekRoutines(members, todos, weekStart, categories);
  const calendarDays = getFamilyWeekCalendarEvents(calendars, weekStart);
  const hasAnyRoutines = days.some((d) => d.memberRows.length > 0);
  const hasAnyEvents = calendarDays.some((d) => d.events.length > 0);

  if (!hasAnyRoutines && !hasAnyEvents) {
    return <p className="empty-note">Inga återkommande rutiner eller händelser de närmaste dagarna ännu.</p>;
  }

  return (
    <div aria-label="Kommande dagars rutiner" className="family-week-routines">
      {days.map((day, i) => {
        const isToday = day.dateStr === todayStr;
        const dayEvents = calendarDays[i]?.events ?? [];
        const dayDate = new Date(`${day.dateStr}T12:00:00`);
        const weekdayLabel = capitalize(WEEKDAY_LABEL_FORMAT.format(dayDate));
        // Helgmarkering (2026-08-30, Zaidas önskemål: "Lördagar och söndagar
        // skall få en färg som sticker ut lite lätt för att visa att det är
        // helg då") — getDay() 0=söndag, 6=lördag. Egen klass, inte samma
        // som --today (en lördag/söndag som RÅKAR vara idag ska fortsatt
        // visa dagens egen, starkare markering — se CSS:ens :not()-regel).
        const dow = dayDate.getDay();
        const isWeekend = dow === 0 || dow === 6;
        return (
          <div
            className={
              "family-week-routines__day" +
              (isToday ? " family-week-routines__day--today" : "") +
              (isWeekend ? " family-week-routines__day--weekend" : "")
            }
            key={day.dateStr}
          >
            <div className="family-week-routines__day-header">
              <span>{weekdayLabel}</span>
              <span className="family-week-routines__day-date">
                {DATE_LABEL_FORMAT.format(dayDate)}
              </span>
              {isToday && <span className="family-week-routines__today-badge">Idag</span>}
            </div>
            {dayEvents.length > 0 && (
              <ul className="family-week-routines__events" aria-label={`Kalenderhändelser ${weekdayLabel}`}>
                {dayEvents.map((ev) => (
                  <li
                    className="family-week-routines__event"
                    key={ev.id}
                    style={{ borderLeftColor: ev.color }}
                  >
                    {!ev.isAllDay && (
                      <span className="family-week-routines__event-time">
                        {isoToTimeInput(ev.startsAt)}–{isoToTimeInput(ev.endsAt)}
                      </span>
                    )}
                    <span className="family-week-routines__event-title">{ev.title}</span>
                  </li>
                ))}
              </ul>
            )}
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
