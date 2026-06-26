import "./CalendarWeekView.css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { fmtTime, getISOWeek, toLocalDateStr } from "./calendarHelpers";
import type { EnrichedEvent } from "./CalendarEventList";

type CalendarCssVars = React.CSSProperties & {
  "--event-color"?: string;
};

const DOW_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS_SHORT = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];

function fmtShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

type Props = {
  weekEvents: EnrichedEvent[];
  weekStart: Date;
  weekEnd: Date;
  todayStr: string;
  showWeekNumbers?: boolean;
  eventDisplay?: "dots" | "text";
  onPrevWeek: () => void;
  onNextWeek: () => void;
  navExtra?: ReactNode;
  onEventClick?: (ev: EnrichedEvent) => void;
};

export function CalendarWeekView({ weekEvents, weekStart, weekEnd, todayStr, showWeekNumbers, eventDisplay = "text", onPrevWeek, onNextWeek, navExtra, onEventClick }: Props) {
  const weekNum = getISOWeek(weekStart);

  function getEventsForDay(dayStr: string): EnrichedEvent[] {
    return weekEvents.filter((ev) => {
      if (ev.isAllDay) return ev.startsAt.slice(0, 10) <= dayStr && dayStr <= ev.endsAt.slice(0, 10);
      return toLocalDateStr(new Date(ev.startsAt)) <= dayStr && dayStr <= toLocalDateStr(new Date(ev.endsAt));
    }).sort((a, b) => {
      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
      return a.startsAt.localeCompare(b.startsAt);
    });
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <div className="cal-week-view">
      <div className="cal-week-nav">
        <button className="icon-button" onClick={onPrevWeek} type="button" aria-label="Föregående vecka">
          <ChevronLeft size={18} />
        </button>
        <div className="cal-week-title">
          {showWeekNumbers && <span className="cal-wk-num-inline">v.{weekNum}</span>}
          <strong>{fmtShort(weekStart)} – {fmtShort(weekEnd)}</strong>
          {navExtra}
        </div>
        <button className="icon-button" onClick={onNextWeek} type="button" aria-label="Nästa vecka">
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
                {eventDisplay === "dots" ? (
                  <div className="cal-week-col-dots">
                    {events.slice(0, 8).map((ev) => (
                      <span
                        key={ev.id}
                        className="cal-cell-dot"
                        style={{ "--dot-color": ev.color ?? ev.calendarColor } as CalendarCssVars}
                        title={ev.title}
                      />
                    ))}
                    {events.length > 8 && <span className="cal-cell-dot-more">+{events.length - 8}</span>}
                  </div>
                ) : (
                  events.map((ev) => {
                    const color = ev.color ?? ev.calendarColor;
                    return (
                      <div
                        key={ev.id}
                        className="cal-week-col-event"
                        style={{ "--event-color": color } as CalendarCssVars}
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
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
