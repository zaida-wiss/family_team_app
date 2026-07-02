import { useState } from "react";
import { Star } from "lucide-react";
import type { Calendar, Member, PurchasedReward, Role, Todo } from "@shared/types";
import "./ChildTimeline.css";
import { expandForRange, fmtTime, toLocalDateStr } from "../calendars/calendarHelpers";
import { canViewResource, hasPermission } from "../../utils/permissions";
import type { EnrichedEvent } from "../calendars/CalendarEventList";
import { TimelineEventDetail } from "./TimelineEventDetail";
import {
  assignLanes,
  buildTodoMarkers,
  calendarThemeColor,
  durPct,
  fmtHourLabel,
  getTimelineRange,
  markerLeft,
  markerPct,
  minuteOfDay,
  pinPositions,
  timePct,
} from "./timelineMath";

type Props = {
  calendars: Calendar[];
  child: Member;
  roles: Role[];
  selectedDay: Date;
  todos: Todo[];
  purchased: PurchasedReward[];
};

export function ChildTimeline({ calendars, child, roles, selectedDay, todos, purchased }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<EnrichedEvent | null>(null);
  const todayStr = toLocalDateStr(new Date());

  const selectedDayEnd = new Date(selectedDay);
  selectedDayEnd.setHours(23, 59, 59, 999);
  const selectedDayStr = toLocalDateStr(selectedDay);
  const timelineRange = getTimelineRange(child);

  const visibleCalIds = new Set(
    calendars
      .filter((cal) => {
        if (cal.deletedAt !== null) return false;
        if (hasPermission(child, roles, "canSeeAllCalendar")) return true;
        return hasPermission(child, roles, "canSeeOwnCalendar") && canViewResource(child, cal);
      })
      .map((cal) => cal.id)
  );

  const subSymbols = new Map<string, string>();
  for (const cal of calendars) {
    if (cal.deletedAt !== null) continue;
    for (const sub of cal.subscriptions ?? []) {
      if (sub.displaySymbol) subSymbols.set(sub.id, sub.displaySymbol);
    }
  }

  const enriched: EnrichedEvent[] = calendars
    .filter((cal) => cal.deletedAt === null)
    .flatMap((cal) =>
      cal.events
        .filter((ev) => {
          if (ev.deletedAt !== null) return false;
          if (visibleCalIds.has(cal.id)) return true;
          return ev.attendees.some((a) => a.memberId === child.id);
        })
        .map((ev) => ({
          ...ev,
          calendarColor: cal.color,
          calendarName: cal.name,
          calendarOwnerId: cal.ownerId,
          displaySymbol: ev.subscriptionId ? (subSymbols.get(ev.subscriptionId) ?? null) : (ev.symbol ?? null),
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

  const dayPurchased = purchased.filter(
    (pr) => toLocalDateStr(new Date(pr.startsAt)) === selectedDayStr
  );

  const completedTodos = todos.filter(
    (t) =>
      (t.status === "done" || t.status === "approved") &&
      t.completedAt !== null &&
      toLocalDateStr(new Date(t.completedAt)) === selectedDayStr &&
      t.deletedAt === null
  );

  const todoPinPos = pinPositions(
    completedTodos.map((t) => ({ id: t.id, isoTime: t.completedAt! })),
    timelineRange
  );
  const rewardPinPos = pinPositions(
    dayPurchased.filter((pr) => pr.durationMinutes === null).map((pr) => ({ id: pr.id, isoTime: pr.startsAt })),
    timelineRange,
    true
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

                {/* Completed todo pins */}
                {completedTodos.map((t) => {
                  const pos = todoPinPos.get(t.id);
                  if (!pos) return null;
                  return (
                    <div
                      key={t.id}
                      className="child-tl-reward-pin child-tl-reward-pin--done"
                      style={{ top: pos.top, left: pos.left }}
                      title={t.title}
                    >
                      {t.visual.value}
                    </div>
                  );
                })}

                {/* Purchased rewards */}
                {dayPurchased.map((pr) => {
                  if (pr.durationMinutes === null) {
                    const pos = rewardPinPos.get(pr.id);
                    if (!pos) return null;
                    return (
                      <div
                        key={pr.id}
                        className="child-tl-reward-pin"
                        style={{ top: pos.top, left: pos.left }}
                        title={pr.itemTitle}
                      >
                        {pr.itemSymbol ?? "🎁"}
                      </div>
                    );
                  }
                  const top = Math.max(0, Math.min(100, timePct(pr.startsAt, timelineRange)));
                  const endsAt = new Date(new Date(pr.startsAt).getTime() + pr.durationMinutes * 60000).toISOString();
                  const height = durPct(pr.startsAt, endsAt, timelineRange);
                  return (
                    <div
                      key={pr.id}
                      className="child-tl-reward-block"
                      style={{ top: `${top}%`, height: `${height}%` }}
                      title={`${pr.itemTitle} · ${fmtTime(pr.startsAt)}–${fmtTime(endsAt)}`}
                    >
                      <span className="child-tl-reward-block__symbol">{pr.itemSymbol ?? "🎁"}</span>
                      <span className="child-tl-reward-block__title">{pr.itemTitle}</span>
                    </div>
                  );
                })}

                {/* All-day events: thin bar at top */}
                {allDay.map((ev) => (
                  <button
                    key={ev.id}
                    className={`child-tl-allday${ev.displaySymbol ? " child-tl-allday--symbol" : ""}`}
                    style={{ "--ev-color": calendarThemeColor(ev.calendarId) } as React.CSSProperties}
                    title={ev.title}
                    type="button"
                    onClick={() => setSelectedEvent(ev)}
                  >
                    {ev.displaySymbol
                      ? <span className="child-tl-event-symbol">{ev.displaySymbol}</span>
                      : <span className="child-tl-event-title">{ev.title}</span>
                    }
                  </button>
                ))}

                {/* Timed events positioned by time % */}
                {laned.map((ev) => {
                  const top = Math.max(0, Math.min(100, timePct(ev.startsAt, timelineRange)));
                  const height = durPct(ev.startsAt, ev.endsAt, timelineRange);
                  const left = ev.lanes > 1 ? `${(ev.lane / ev.lanes) * 100}%` : 0;
                  const width = ev.lanes > 1 ? `${100 / ev.lanes}%` : "100%";
                  const durationMin = (new Date(ev.endsAt).getTime() - new Date(ev.startsAt).getTime()) / 60000;
                  const isLong = durationMin >= 120;
                  return (
                    <button
                      key={ev.id}
                      className={`child-tl-event${ev.displaySymbol ? " child-tl-event--symbol" : ""}${isLong ? " child-tl-event--long" : ""}`}
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        left,
                        width,
                        "--ev-color": calendarThemeColor(ev.calendarId),
                      } as React.CSSProperties}
                      title={`${ev.title} · ${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`}
                      type="button"
                      onClick={() => setSelectedEvent(ev)}
                    >
                      {ev.displaySymbol
                        ? <span className="child-tl-event-symbol">{ev.displaySymbol}</span>
                        : <span className="child-tl-event-title">{ev.title}</span>
                      }
                    </button>
                  );
                })}
              </div>
            </div>
      </div>

      {selectedEvent && (
        <TimelineEventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </section>
  );
}
