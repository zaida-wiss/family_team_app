import { useState } from "react";
import { MapPin, Star, X } from "lucide-react";
import type { Calendar, Member, Role, Todo } from "@shared/types";
import "./ChildTimeline.css";
import { expandForRange, fmtTime, toLocalDateStr } from "../calendars/calendarHelpers";
import { canViewResource, hasPermission } from "../../utils/permissions";
import type { EnrichedEvent } from "../calendars/CalendarEventList";

const DOW_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS_SHORT = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const DEFAULT_TIMELINE_RANGE = { startMinute: 6 * 60, endMinute: 21 * 60 };

type TimelineRange = {
  startMinute: number;
  endMinute: number;
};

function fmtDayLabel(isoStr: string): string {
  const d = new Date(isoStr);
  return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function fmtEventTime(ev: EnrichedEvent): string {
  if (ev.isAllDay) return "Heldag";
  return `${fmtTime(ev.startsAt)}-${fmtTime(ev.endsAt)}`;
}

function fmtHourLabel(minute: number): string {
  return String(Math.floor(minute / 60)).padStart(2, "0");
}

function fmtDaysFromToday(isoStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(isoStr);
  eventDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((eventDay.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Idag";
  if (diffDays === 1) return "Imorgon";
  if (diffDays === -1) return "Igår";
  if (diffDays > 1) return `Om ${diffDays} dagar`;
  return `För ${Math.abs(diffDays)} dagar sedan`;
}

function minuteOfDay(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

function timeInputToMinutes(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const [hour, minute] = value.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return fallback;
  }

  return hour * 60 + minute;
}

function getTimelineRange(child: Member): TimelineRange {
  const startMinute = timeInputToMinutes(
    child.childTimelineSettings?.startsAt,
    DEFAULT_TIMELINE_RANGE.startMinute
  );
  const endMinute = timeInputToMinutes(
    child.childTimelineSettings?.endsAt,
    DEFAULT_TIMELINE_RANGE.endMinute
  );

  return startMinute < endMinute ? { startMinute, endMinute } : DEFAULT_TIMELINE_RANGE;
}

function timePct(isoStr: string, range: TimelineRange): number {
  return ((minuteOfDay(isoStr) - range.startMinute) / (range.endMinute - range.startMinute)) * 100;
}

function durPct(startsAt: string, endsAt: string, range: TimelineRange): number {
  const startPct = Math.max(0, Math.min(100, timePct(startsAt, range)));
  const endsSameDay = toLocalDateStr(new Date(startsAt)) === toLocalDateStr(new Date(endsAt));
  const rawEndPct = endsSameDay ? timePct(endsAt, range) : 100;
  const endPct = Math.max(startPct + 3, Math.min(100, rawEndPct));
  return endPct - startPct;
}

function markerPct(isoStr: string, range: TimelineRange): number {
  return Math.max(0, Math.min(100, timePct(isoStr, range)));
}

function taskWindowPct(startsAt: string, expiresAt: string | null, range: TimelineRange): number {
  if (!expiresAt) {
    return 0;
  }

  const startTime = new Date(startsAt).getTime();
  const endTime = new Date(expiresAt).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return 0;
  }

  const startPct = markerPct(startsAt, range);
  const endsSameDay = toLocalDateStr(new Date(startsAt)) === toLocalDateStr(new Date(expiresAt));
  const rawEndPct = endsSameDay ? timePct(expiresAt, range) : 100;
  const endPct = Math.max(startPct + 2, Math.min(100, rawEndPct));
  return Math.max(0, endPct - startPct);
}

function markerLeft(todoId: string): string {
  const h = [...todoId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0x7fff, 0);
  return `${4 + (h % 74)}%`;
}

type TodoMarker = {
  todo: Todo;
  startsAt: string;
  windowPct: number;
};

function buildTodoMarkers(todos: Todo[], selectedDay: Date, range: TimelineRange): TodoMarker[] {
  return [...todos]
    .sort((a, b) => (a.visibleFrom ?? "").localeCompare(b.visibleFrom ?? ""))
    .map((todo) => {
      const startsAt = todo.visibleFrom ?? selectedDay.toISOString();
      return { todo, startsAt, windowPct: taskWindowPct(startsAt, todo.expiresAt, range) };
    });
}

type LanedEvent = EnrichedEvent & { lane: number; lanes: number };

function assignLanes(events: EnrichedEvent[]): LanedEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const laneEnds: string[] = [];
  const result = sorted.map((ev) => {
    let lane = laneEnds.findIndex((end) => end <= ev.startsAt);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(ev.endsAt); }
    else laneEnds[lane] = ev.endsAt;
    return { ...ev, lane };
  });
  const lanes = laneEnds.length;
  return result.map((ev) => ({ ...ev, lanes }));
}

type Props = {
  calendars: Calendar[];
  child: Member;
  roles: Role[];
  selectedDay: Date;
  todos: Todo[];
};

export function ChildTimeline({ calendars, child, roles, selectedDay, todos }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<EnrichedEvent | null>(null);
  const todayStr = toLocalDateStr(new Date());

  const selectedDayEnd = new Date(selectedDay);
  selectedDayEnd.setHours(23, 59, 59, 999);
  const selectedDayStr = toLocalDateStr(selectedDay);
  const timelineRange = getTimelineRange(child);

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
    cal.events.filter((ev) => ev.deletedAt === null).map((ev) => ({
      ...ev,
      calendarColor: cal.color,
      calendarName: cal.name,
      calendarOwnerId: cal.ownerId,
      displaySymbol: ev.subscriptionId ? (subSymbols.get(ev.subscriptionId) ?? null) : null,
    }))
  );

  const dayEvents = expandForRange(enriched, selectedDay, selectedDayEnd);

  function timedForDay(dayStr: string): EnrichedEvent[] {
    return dayEvents.filter(
      (ev) => {
        if (ev.isAllDay || toLocalDateStr(new Date(ev.startsAt)) !== dayStr) {
          return false;
        }

        const startsMinute = minuteOfDay(ev.startsAt);
        const endsMinute =
          toLocalDateStr(new Date(ev.startsAt)) === toLocalDateStr(new Date(ev.endsAt))
            ? minuteOfDay(ev.endsAt)
            : timelineRange.endMinute;

        return startsMinute < timelineRange.endMinute && endsMinute > timelineRange.startMinute;
      }
    );
  }

  function allDayForDay(dayStr: string): EnrichedEvent[] {
    return dayEvents.filter(
      (ev) => ev.isAllDay && ev.startsAt.slice(0, 10) <= dayStr && dayStr <= ev.endsAt.slice(0, 10)
    );
  }

  const now = new Date();
  const nowTime = now.getTime();
  const isSelectedToday = selectedDayStr === todayStr;
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const showNowLine =
    isSelectedToday &&
    nowMinute >= timelineRange.startMinute &&
    nowMinute <= timelineRange.endMinute;
  const nowPct = showNowLine ? timePct(now.toISOString(), timelineRange) : -1;
  const allDay = allDayForDay(selectedDayStr);
  const laned = assignLanes(timedForDay(selectedDayStr));
  const hourLabels = [];
  for (
    let minute = Math.ceil(timelineRange.startMinute / 60) * 60;
    minute <= timelineRange.endMinute;
    minute += 60
  ) {
    hourLabels.push({
      minute,
      label: fmtHourLabel(minute),
      top: ((minute - timelineRange.startMinute) / (timelineRange.endMinute - timelineRange.startMinute)) * 100,
    });
  }
  const upcomingTodoMarkers = buildTodoMarkers(
    todos.filter((todo) => {
      if (
        todo.assignedTo !== child.id ||
        todo.status !== "pending" ||
        todo.recurrence.type !== "none" ||
        todo.deletedAt !== null ||
        !todo.visibleFrom
      ) {
        return false;
      }

      const startsAt = new Date(todo.visibleFrom);
      if (!Number.isFinite(startsAt.getTime())) {
        return false;
      }

      if (toLocalDateStr(startsAt) !== selectedDayStr) {
        return false;
      }

      const startsMinute = minuteOfDay(todo.visibleFrom);
      if (startsMinute < timelineRange.startMinute || startsMinute >= timelineRange.endMinute) {
        return false;
      }

      return !isSelectedToday || startsAt.getTime() > nowTime;
    }),
    selectedDay,
    timelineRange
  );

  return (
    <section className="child-timeline" aria-label="Min dag">
      <div className="child-tl-days">
            <div className={`child-tl-day${isSelectedToday ? " child-tl-day--today" : ""}`}>
              <div className="child-tl-day-track">
                <div className="child-tl-hour-labels" aria-hidden="true">
                  {hourLabels.map((hour) => (
                    <span key={hour.minute} style={{ top: `${hour.top}%` }}>
                      {hour.label}
                    </span>
                  ))}
                </div>

                {showNowLine && (
                  <div className="child-tl-now" style={{ top: `${nowPct}%` }} />
                )}

                {upcomingTodoMarkers.map((marker) => {
                  const starCount = Math.min(3, Math.max(1, marker.todo.starValue));
                  return (
                    <div
                      key={marker.todo.id}
                      className={`child-tl-task-marker${marker.windowPct > 0 ? " child-tl-task-marker--window" : ""}`}
                      style={{
                        top: `${markerPct(marker.startsAt, timelineRange)}%`,
                        height: marker.windowPct > 0 ? `${marker.windowPct}%` : undefined,
                        left: markerLeft(marker.todo.id),
                      } as React.CSSProperties}
                      title={`${marker.todo.title} · ${fmtTime(marker.startsAt)}${marker.todo.expiresAt ? `-${fmtTime(marker.todo.expiresAt)}` : ""}`}
                      aria-label={`${marker.todo.title} kommer ${fmtTime(marker.startsAt)}${marker.todo.expiresAt ? ` och kan göras till ${fmtTime(marker.todo.expiresAt)}` : ""}`}
                    >
                      <span className="child-tl-task-marker-stars">
                        {Array.from({ length: starCount }).map((_, i) => (
                          <span key={i} className="child-tl-task-marker-star">
                            <Star size={8} fill="currentColor" />
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}

                {/* All-day events: thin bar at top */}
                {allDay.map((ev) => (
                  <button
                    key={ev.id}
                    className={`child-tl-allday${ev.displaySymbol ? " child-tl-allday--symbol" : ""}`}
                    style={{ background: ev.color ?? ev.calendarColor }}
                    title={ev.title}
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                  >
                    {ev.displaySymbol && <span className="child-tl-event-symbol">{ev.displaySymbol}</span>}
                    <span className="child-tl-event-copy">
                      <span className="child-tl-event-time">Heldag</span>
                      <span className="child-tl-event-title">{ev.title}</span>
                    </span>
                  </button>
                ))}

                {/* Timed events positioned by time % */}
                {laned.map((ev) => {
                  const top = Math.max(0, Math.min(100, timePct(ev.startsAt, timelineRange)));
                  const height = durPct(ev.startsAt, ev.endsAt, timelineRange);
                  const left = ev.lanes > 1 ? `${(ev.lane / ev.lanes) * 100}%` : 0;
                  const width = ev.lanes > 1 ? `${100 / ev.lanes}%` : "100%";
                  return (
                    <button
                      key={ev.id}
                      className={`child-tl-event${ev.displaySymbol ? " child-tl-event--symbol" : ""}`}
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        left,
                        width,
                        background: ev.color ?? ev.calendarColor,
                      }}
                      title={`${ev.title} · ${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`}
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                    >
                      {ev.displaySymbol && <span className="child-tl-event-symbol">{ev.displaySymbol}</span>}
                      <span className="child-tl-event-copy">
                          <span className="child-tl-event-time">
                            {fmtTime(ev.startsAt)}-{fmtTime(ev.endsAt)}
                          </span>
                          <span className="child-tl-event-title">{ev.title}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
      </div>

      {selectedEvent && (
        <div
          className="child-tl-detail-backdrop"
          onClick={() => setSelectedEvent(null)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            className="child-tl-detail"
            role="dialog"
            aria-modal="true"
            aria-label={`Information om ${selectedEvent.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="child-tl-detail-close"
              type="button"
              aria-label="Stäng händelseinformation"
              onClick={() => setSelectedEvent(null)}
            >
              <X size={14} />
            </button>
            {selectedEvent.displaySymbol && (
              <div className="child-tl-detail-symbol">{selectedEvent.displaySymbol}</div>
            )}
            <h3>{selectedEvent.title}</h3>
            <p className="child-tl-detail-time">
              {fmtDayLabel(selectedEvent.startsAt)} · {fmtEventTime(selectedEvent)}
            </p>
            <p className="child-tl-detail-distance">{fmtDaysFromToday(selectedEvent.startsAt)}</p>
            <p className="child-tl-detail-calendar">{selectedEvent.calendarName}</p>
            {selectedEvent.location && (
              <p className="child-tl-detail-location">
                <MapPin size={13} />
                <span>{selectedEvent.location}</span>
              </p>
            )}
            {selectedEvent.notes && (
              <p className="child-tl-detail-notes">{selectedEvent.notes.replace(/\\n/g, "\n")}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
