import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Calendar, Member, Role } from "@shared/types";
import { addInterval, fmtTime, getISOWeek, toLocalDateStr } from "../calendars/calendarHelpers";
import { canViewResource, hasPermission } from "../../utils/permissions";
import type { EnrichedEvent } from "../calendars/CalendarEventList";

const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function getWeekMonday(offset: number): Date {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0=Mån, 6=Sön
  const d = new Date(today);
  d.setDate(today.getDate() - dow + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function expandForRange(events: EnrichedEvent[], from: Date, to: Date): EnrichedEvent[] {
  const result: EnrichedEvent[] = [];
  for (const ev of events) {
    const rec = ev.recurrence;
    if (rec.type === "none") {
      const s = new Date(ev.startsAt);
      const e = new Date(ev.endsAt);
      if (s <= to && e >= from) result.push(ev);
      continue;
    }
    const origStart = new Date(ev.startsAt);
    if (origStart > to) continue;
    const duration = new Date(ev.endsAt).getTime() - origStart.getTime();
    const until = rec.until ? new Date(rec.until) : null;
    const msPerStep =
      rec.type === "yearly" ? rec.interval * 365.25 * 86400000
      : rec.type === "monthly" ? rec.interval * 30.44 * 86400000
      : rec.type === "weekly" ? rec.interval * 7 * 86400000
      : rec.interval * 86400000;
    let cur = new Date(origStart);
    if (cur < from) {
      const skip = Math.max(0, Math.floor((from.getTime() - cur.getTime()) / msPerStep) - 2);
      for (let i = 0; i < skip; i++) cur = addInterval(cur, rec.type, rec.interval);
      while (cur < from) cur = addInterval(cur, rec.type, rec.interval);
    }
    let guard = 0;
    while (cur <= to && guard++ < 50) {
      if (until && cur > until) break;
      result.push({
        ...ev,
        id: `${ev.id}~${cur.getTime()}`,
        startsAt: cur.toISOString(),
        endsAt: new Date(cur.getTime() + duration).toISOString(),
      });
      cur = addInterval(new Date(cur), rec.type, rec.interval);
    }
  }
  return result;
}

type Props = {
  calendars: Calendar[];
  child: Member;
  roles: Role[];
};

export function ChildWeekView({ calendars, child, roles }: Props) {
  const [offset, setOffset] = useState(0);

  const monday = getWeekMonday(offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const weekNum = getISOWeek(monday);
  const todayStr = toLocalDateStr(new Date());

  const visible = calendars.filter((cal) => {
    if (cal.deletedAt !== null) return false;
    if (hasPermission(child, roles, "canSeeAllCalendar")) return true;
    return hasPermission(child, roles, "canSeeOwnCalendar") && canViewResource(child, cal);
  });

  const subSymbols = new Map<string, string>();
  for (const cal of visible) {
    for (const sub of cal.subscriptions ?? []) {
      if (sub.displaySymbol) subSymbols.set(sub.id, sub.displaySymbol);
    }
  }

  const enriched: EnrichedEvent[] = visible.flatMap((cal) =>
    cal.events
      .filter((ev) => ev.deletedAt === null)
      .map((ev) => ({
        ...ev,
        calendarColor: cal.color,
        calendarName: cal.name,
        calendarOwnerId: cal.ownerId,
        displaySymbol: ev.subscriptionId ? (subSymbols.get(ev.subscriptionId) ?? null) : null,
      }))
  );

  const weekEvents = expandForRange(enriched, monday, sunday);

  function getEventsForDay(dayStr: string): EnrichedEvent[] {
    return weekEvents
      .filter((ev) => {
        const start = ev.isAllDay ? ev.startsAt.slice(0, 10) : toLocalDateStr(new Date(ev.startsAt));
        const end = ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
        return start <= dayStr && dayStr <= end;
      })
      .sort((a, b) => {
        if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
        return a.startsAt.localeCompare(b.startsAt);
      });
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  return (
    <section className="child-week-view" aria-label="Veckovy">
      <div className="child-week-header">
        <button
          className="child-week-nav"
          onClick={() => setOffset((o) => o - 1)}
          type="button"
          aria-label="Föregående vecka"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="child-week-title">
          <span>Vecka {weekNum}</span>
          <small>{fmtShort(monday)} – {fmtShort(sunday)}</small>
        </div>
        <button
          className="child-week-nav"
          onClick={() => setOffset((o) => o + 1)}
          type="button"
          aria-label="Nästa vecka"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="child-week-days">
        {days.map((day, i) => {
          const dayStr = toLocalDateStr(day);
          const isToday = dayStr === todayStr;
          const events = getEventsForDay(dayStr);

          return (
            <div
              key={dayStr}
              className={`child-week-day${isToday ? " child-week-day--today" : ""}${events.length === 0 ? " child-week-day--empty" : ""}`}
            >
              <div className="child-week-day-label">
                <span className="child-week-dow">{WEEKDAYS[i].slice(0, 3)}</span>
                <span className="child-week-date">{day.getDate()}</span>
              </div>
              {events.length > 0 && (
                <ul className="child-week-events">
                  {events.map((ev) => (
                    <li key={ev.id} className="child-week-event">
                      <span
                        className="child-week-event-dot"
                        style={{ background: ev.color ?? ev.calendarColor }}
                      />
                      <div className="child-week-event-body">
                        <span className="child-week-event-title">
                          {ev.displaySymbol && <span style={{ marginRight: "0.3em" }}>{ev.displaySymbol}</span>}
                          {ev.title}
                        </span>
                        <span className="child-week-event-time">
                          {ev.isAllDay ? "Heldag" : `${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
