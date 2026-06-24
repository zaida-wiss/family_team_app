import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";
import type { Calendar, Member, Role } from "@shared/types";
import { expandForRange, fmtTime, toLocalDateStr } from "../calendars/calendarHelpers";
import { canViewResource, hasPermission } from "../../utils/permissions";
import type { EnrichedEvent } from "../calendars/CalendarEventList";

const DOW_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS_SHORT = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];

function getDayByOffset(offset: number): Date {
  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function fmtDayLabel(isoStr: string): string {
  const d = new Date(isoStr);
  return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function fmtEventTime(ev: EnrichedEvent): string {
  if (ev.isAllDay) return "Heldag";
  return `${fmtTime(ev.startsAt)}-${fmtTime(ev.endsAt)}`;
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

function timePct(isoStr: string): number {
  const d = new Date(isoStr);
  return ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
}

function durPct(startsAt: string, endsAt: string): number {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return Math.max((ms / 3600000 / 24) * 100, 3);
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

type Props = { calendars: Calendar[]; child: Member; roles: Role[] };

export function ChildTimeline({ calendars, child, roles }: Props) {
  const [offset, setOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<EnrichedEvent | null>(null);
  const todayStr = toLocalDateStr(new Date());

  const selectedDay = getDayByOffset(offset);
  const selectedDayEnd = new Date(selectedDay);
  selectedDayEnd.setHours(23, 59, 59, 999);
  const selectedDayStr = toLocalDateStr(selectedDay);
  const selectedDayLabel = `${DOW_SHORT[selectedDay.getDay()]} ${fmtShort(selectedDay)}`;
  const selectedDayColorClass = `child-tl-day-color-${selectedDay.getDay()}`;

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
      (ev) => !ev.isAllDay && toLocalDateStr(new Date(ev.startsAt)) === dayStr
    );
  }

  function allDayForDay(dayStr: string): EnrichedEvent[] {
    return dayEvents.filter(
      (ev) => ev.isAllDay && ev.startsAt.slice(0, 10) <= dayStr && dayStr <= ev.endsAt.slice(0, 10)
    );
  }

  const now = new Date();
  const isSelectedToday = selectedDayStr === todayStr;
  const nowPct = isSelectedToday ? timePct(now.toISOString()) : -1;
  const allDay = allDayForDay(selectedDayStr);
  const laned = assignLanes(timedForDay(selectedDayStr));

  return (
    <section className="child-timeline" aria-label="Min dag">
      <div className="child-tl-nav">
        <button className="icon-button" onClick={() => setOffset((o) => o - 1)} type="button" aria-label="Föregående dag">
          <ChevronLeft size={12} />
        </button>
        <span className={`child-tl-week-label ${selectedDayColorClass}`}>{selectedDayLabel}</span>
        <button className="icon-button" onClick={() => setOffset((o) => o + 1)} type="button" aria-label="Nästa dag">
          <ChevronRight size={12} />
        </button>
      </div>

      <div className="child-tl-days">
            <div className={`child-tl-day${isSelectedToday ? " child-tl-day--today" : ""}`}>
              <div className="child-tl-day-track">
                {/* Red now line */}
                {isSelectedToday && (
                  <div className="child-tl-now" style={{ top: `${nowPct}%` }} />
                )}

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
                  const top = timePct(ev.startsAt);
                  const height = durPct(ev.startsAt, ev.endsAt);
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
