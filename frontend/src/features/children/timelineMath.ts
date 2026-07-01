import type { Member, Todo } from "@shared/types";
import { fmtTime, toLocalDateStr } from "../calendars/calendarHelpers";
import type { EnrichedEvent } from "../calendars/CalendarEventList";

const DOW_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS_SHORT = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const DEFAULT_TIMELINE_RANGE = { startMinute: 6 * 60, endMinute: 21 * 60 };

export type TimelineRange = {
  startMinute: number;
  endMinute: number;
};

export function fmtDayLabel(isoStr: string): string {
  const d = new Date(isoStr);
  return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function fmtEventTime(ev: EnrichedEvent): string {
  if (ev.isAllDay) return "Heldag";
  return `${fmtTime(ev.startsAt)}-${fmtTime(ev.endsAt)}`;
}

export function fmtHourLabel(minute: number): string {
  return String(Math.floor(minute / 60)).padStart(2, "0");
}

export function fmtDaysFromToday(isoStr: string): string {
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

export function minuteOfDay(isoStr: string): number {
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

export function getTimelineRange(child: Member): TimelineRange {
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

export function timePct(isoStr: string, range: TimelineRange): number {
  return ((minuteOfDay(isoStr) - range.startMinute) / (range.endMinute - range.startMinute)) * 100;
}

export function durPct(startsAt: string, endsAt: string, range: TimelineRange): number {
  const startPct = Math.max(0, Math.min(100, timePct(startsAt, range)));
  const endsSameDay = toLocalDateStr(new Date(startsAt)) === toLocalDateStr(new Date(endsAt));
  const rawEndPct = endsSameDay ? timePct(endsAt, range) : 100;
  const endPct = Math.max(startPct + 3, Math.min(100, rawEndPct));
  return endPct - startPct;
}

export function markerPct(isoStr: string, range: TimelineRange): number {
  return Math.max(0, Math.min(100, timePct(isoStr, range)));
}

export function taskWindowPct(startsAt: string, expiresAt: string | null, range: TimelineRange): number {
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

export function markerLeft(todoId: string): string {
  const h = [...todoId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0x7fff, 0);
  return `${4 + (h % 74)}%`;
}

export function pinPositions(items: { id: string; isoTime: string }[], range: TimelineRange) {
  const SLOT_SIZE = 14;
  const groups = new Map<number, string[]>();
  for (const { id, isoTime } of items) {
    const slot = Math.round(minuteOfDay(isoTime) / SLOT_SIZE);
    const g = groups.get(slot) ?? [];
    g.push(id);
    groups.set(slot, g);
  }
  const result = new Map<string, { top: number; left: string }>();
  for (const [slot, ids] of groups) {
    const top = Math.max(0, Math.min(100, ((slot * SLOT_SIZE) - range.startMinute) / (range.endMinute - range.startMinute) * 100));
    ids.forEach((id, i) => {
      const left = `${4 + i * 22}%`;
      result.set(id, { top, left });
    });
  }
  return result;
}

const THEME_EVENT_COLORS = ["var(--c1)", "var(--c0)", "var(--c2)", "var(--c3)"];

export function calendarThemeColor(calendarId: string): string {
  const h = [...calendarId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0x7fff, 0);
  return THEME_EVENT_COLORS[h % THEME_EVENT_COLORS.length];
}

export type TodoMarker = {
  todo: Todo;
  startsAt: string;
  windowPct: number;
};

export function buildTodoMarkers(todos: Todo[], selectedDay: Date, range: TimelineRange): TodoMarker[] {
  return [...todos]
    .sort((a, b) => (a.visibleFrom ?? "").localeCompare(b.visibleFrom ?? ""))
    .map((todo) => {
      const startsAt = todo.visibleFrom ?? selectedDay.toISOString();
      return { todo, startsAt, windowPct: taskWindowPct(startsAt, todo.expiresAt, range) };
    });
}

export type LanedEvent = EnrichedEvent & { lane: number; lanes: number };

export function assignLanes(events: EnrichedEvent[]): LanedEvent[] {
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
