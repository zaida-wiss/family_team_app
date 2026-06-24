import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Calendar } from "@shared/types";
import { expandForRange, fmtTime, getISOWeek, toLocalDateStr } from "./calendarHelpers";
import type { EnrichedEvent } from "./CalendarEventList";

const DOW_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS_SHORT = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];

function getWeekMonday(offset: number): Date {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() - dow + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

type Props = {
  visible: Calendar[];
  calendarDisplayColor: Map<string, string>;
  todayStr: string;
  showWeekNumbers?: boolean;
  onEventClick?: (ev: EnrichedEvent) => void;
};

export function CalendarWeekView({ visible, calendarDisplayColor, todayStr, showWeekNumbers, onEventClick }: Props) {
  const [offset, setOffset] = useState(0);

  const monday = getWeekMonday(offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const weekNum = getISOWeek(monday);

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
        calendarColor: calendarDisplayColor.get(cal.id) ?? cal.color,
        calendarName: cal.name,
        calendarOwnerId: cal.ownerId,
        displaySymbol: ev.subscriptionId ? (subSymbols.get(ev.subscriptionId) ?? null) : null,
      }))
  );

  const weekEvents = expandForRange(enriched, monday, sunday);

  function getEventsForDay(dayStr: string): EnrichedEvent[] {
    return weekEvents.filter((ev) => {
      if (ev.isAllDay) return ev.startsAt.slice(0, 10) <= dayStr && dayStr <= ev.endsAt.slice(0, 10);
      return toLocalDateStr(new Date(ev.startsAt)) === dayStr;
    }).sort((a, b) => {
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
    <div className="cal-week-view">
      <div className="cal-week-nav">
        <button className="icon-button" onClick={() => setOffset((o) => o - 1)} type="button" aria-label="Föregående vecka">
          <ChevronLeft size={18} />
        </button>
        <div className="cal-week-title">
          {showWeekNumbers && <span className="cal-wk-num-inline">v.{weekNum}</span>}
          <strong>{fmtShort(monday)} – {fmtShort(sunday)}</strong>
        </div>
        <button className="icon-button" onClick={() => setOffset((o) => o + 1)} type="button" aria-label="Nästa vecka">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="cal-week-cols">
        {days.map((day) => {
          const dayStr = toLocalDateStr(day);
          const isToday = dayStr === todayStr;
          const events = getEventsForDay(dayStr);

          return (
            <div key={dayStr} className={`cal-week-col${isToday ? " cal-week-col--today" : ""}`}>
              <div className="cal-week-col-head">
                <div className="cal-week-col-dow">{DOW_SHORT[day.getDay()]}</div>
                <div className={`cal-week-col-date${isToday ? " cal-week-col-date--today" : ""}`}>
                  {day.getDate()}
                </div>
              </div>
              <div className="cal-week-col-events">
                {events.map((ev) => {
                  const color = ev.color ?? ev.calendarColor;
                  return (
                    <div
                      key={ev.id}
                      className="cal-week-col-event"
                      style={{ background: color }}
                      onClick={() => onEventClick?.(ev)}
                      title={ev.isAllDay ? ev.title : `${fmtTime(ev.startsAt)} ${ev.title}`}
                    >
                      {ev.displaySymbol && <span>{ev.displaySymbol} </span>}
                      {!ev.isAllDay && (
                        <span className="cal-week-col-event-time">{fmtTime(ev.startsAt)}</span>
                      )}
                      {ev.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
