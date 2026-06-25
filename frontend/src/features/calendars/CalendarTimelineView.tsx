import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Calendar } from "@shared/types";
import { expandForRange, fmtTime, getISOWeek, toLocalDateStr } from "./calendarHelpers";
import type { EnrichedEvent } from "./CalendarEventList";

const DOW_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS_SHORT = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const HOUR_H = 56;
const START_H = 6;
const END_H = 23;
const GRID_H = (END_H - START_H) * HOUR_H;
const HOURS = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

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

function timeToY(isoStr: string): number {
  const d = new Date(isoStr);
  return Math.max(0, (d.getHours() + d.getMinutes() / 60 - START_H) * HOUR_H);
}

function durationToH(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return Math.max((ms / 3600000) * HOUR_H, 22);
}

type LayoutEvent = EnrichedEvent & { col: number; cols: number };

function layoutEvents(events: EnrichedEvent[]): LayoutEvent[] {
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const colEnds: number[] = [];
  return sorted.map((ev) => {
    const startMs = new Date(ev.startsAt).getTime();
    const endMs = new Date(ev.endsAt).getTime();
    let col = colEnds.findIndex((t) => t <= startMs);
    if (col === -1) { col = colEnds.length; colEnds.push(endMs); }
    else colEnds[col] = endMs;
    const concurrent = sorted.filter(
      (o) => o.id !== ev.id &&
        new Date(o.startsAt).getTime() < endMs &&
        new Date(o.endsAt).getTime() > startMs
    ).length;
    return { ...ev, col, cols: concurrent + 1 };
  });
}

type Props = {
  visible: Calendar[];
  calendarDisplayColor: Map<string, string>;
  todayStr: string;
  showWeekNumbers?: boolean;
  navExtra?: ReactNode;
  onEventClick?: (ev: EnrichedEvent) => void;
};

export function CalendarTimelineView({ visible, calendarDisplayColor, todayStr, showWeekNumbers, navExtra, onEventClick }: Props) {
  const [offset, setOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const monday = getWeekMonday(offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const weekNum = getISOWeek(monday);

  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const nowY = (now.getHours() + now.getMinutes() / 60 - START_H) * HOUR_H;
    scrollRef.current.scrollTop = Math.max(0, nowY - 100);
  }, [offset]);

  const subSymbols = new Map<string, string>();
  for (const cal of visible) {
    for (const sub of cal.subscriptions ?? []) {
      if (sub.displaySymbol) subSymbols.set(sub.id, sub.displaySymbol);
    }
  }

  const enriched: EnrichedEvent[] = visible.flatMap((cal) =>
    cal.events.filter((ev) => ev.deletedAt === null).map((ev) => ({
      ...ev,
      calendarColor: calendarDisplayColor.get(cal.id) ?? cal.color,
      calendarName: cal.name,
      calendarOwnerId: cal.ownerId,
      displaySymbol: ev.subscriptionId ? (subSymbols.get(ev.subscriptionId) ?? null) : null,
    }))
  );

  const weekEvents = expandForRange(enriched, monday, sunday);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  function timedEventsForDay(dayStr: string): EnrichedEvent[] {
    return weekEvents.filter((ev) => !ev.isAllDay && toLocalDateStr(new Date(ev.startsAt)) === dayStr);
  }

  function allDayEventsForDay(dayStr: string): EnrichedEvent[] {
    return weekEvents.filter(
      (ev) => ev.isAllDay && ev.startsAt.slice(0, 10) <= dayStr && dayStr <= ev.endsAt.slice(0, 10)
    );
  }

  const now = new Date();
  const nowY = (now.getHours() + now.getMinutes() / 60 - START_H) * HOUR_H;
  const isCurrentWeek = offset === 0;
  const hasAllDay = days.some((d) => allDayEventsForDay(toLocalDateStr(d)).length > 0);

  return (
    <div className="cal-week-view">
      <div className="cal-week-nav">
        <button className="icon-button" onClick={() => setOffset((o) => o - 1)} type="button" aria-label="Föregående vecka">
          <ChevronLeft size={18} />
        </button>
        <div className="cal-week-title">
          {showWeekNumbers && <span className="cal-wk-num-inline">v.{weekNum}</span>}
          <strong>{fmtShort(monday)} – {fmtShort(sunday)}</strong>
          {navExtra}
        </div>
        <button className="icon-button" onClick={() => setOffset((o) => o + 1)} type="button" aria-label="Nästa vecka">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Sticky column headers */}
      <div className="cal-vtl-header">
        <div className="cal-vtl-axis-spacer" />
        {days.map((day) => {
          const dayStr = toLocalDateStr(day);
          const isToday = dayStr === todayStr;
          return (
            <div key={dayStr} className={`cal-vtl-col-head${isToday ? " cal-vtl-col-head--today" : ""}`}>
              <span className="cal-vtl-col-dow">{DOW_SHORT[day.getDay()]}</span>
              <span className={`cal-vtl-col-date${isToday ? " cal-vtl-col-date--today" : ""}`}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      {hasAllDay && (
        <div className="cal-vtl-allday-row">
          <div className="cal-vtl-axis-spacer" />
          {days.map((day) => {
            const dayStr = toLocalDateStr(day);
            return (
              <div key={dayStr} className="cal-vtl-allday-col">
                {allDayEventsForDay(dayStr).map((ev) => (
                  <div
                    key={ev.id}
                    className="cal-vtl-allday-pill"
                    style={{ background: ev.color ?? ev.calendarColor }}
                    onClick={() => onEventClick?.(ev)}
                  >
                    {ev.displaySymbol && <span>{ev.displaySymbol} </span>}
                    {ev.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div className="cal-vtl-scroll" ref={scrollRef}>
        <div className="cal-vtl-grid" style={{ height: GRID_H }}>
          {/* Hour axis */}
          <div className="cal-vtl-axis">
            {HOURS.map((h) => (
              <div key={h} className="cal-vtl-hour-label" style={{ top: (h - START_H) * HOUR_H }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayStr = toLocalDateStr(day);
            const isToday = dayStr === todayStr;
            const events = layoutEvents(timedEventsForDay(dayStr));
            const showNow = isCurrentWeek && isToday && nowY >= 0 && nowY <= GRID_H;

            return (
              <div key={dayStr} className={`cal-vtl-col${isToday ? " cal-vtl-col--today" : ""}`}>
                {showNow && (
                  <div className="cal-vtl-now" style={{ top: nowY }}>
                    <div className="cal-vtl-now-dot" />
                    <div className="cal-vtl-now-line" />
                  </div>
                )}

                {events.map((ev) => {
                  const top = timeToY(ev.startsAt);
                  const height = durationToH(ev.startsAt, ev.endsAt);
                  const left = ev.cols > 1 ? `${(ev.col / ev.cols) * 100}%` : "1px";
                  const width = ev.cols > 1 ? `${100 / ev.cols - 1}%` : "calc(100% - 2px)";
                  const color = ev.color ?? ev.calendarColor;
                  return (
                    <div
                      key={ev.id}
                      className="cal-vtl-event"
                      style={{
                        top,
                        height,
                        left,
                        width,
                        borderLeft: `3px solid ${color}`,
                        background: `color-mix(in oklch, ${color} 14%, var(--card))`,
                      }}
                      onClick={() => onEventClick?.(ev)}
                    >
                      <span className="cal-vtl-event-name">
                        {ev.displaySymbol && <span style={{ marginRight: "0.2em" }}>{ev.displaySymbol}</span>}
                        {ev.title}
                      </span>
                      {height > 30 && (
                        <span className="cal-vtl-event-time">{fmtTime(ev.startsAt)}–{fmtTime(ev.endsAt)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
