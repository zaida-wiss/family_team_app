import type { EventRecurrence } from "@shared/types";

// ── Constants ────────────────────────────────────────────────────────────────

export const DAYS = ["MÅN", "TIS", "ONS", "TOR", "FRE", "LÖR", "SÖN"];
export const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];
export const RECURRENCE_LABELS: Record<EventRecurrence["type"], string> = {
  none: "Ingen upprepning",
  daily: "Dagligen",
  weekly: "Veckovis",
  monthly: "Månadsvis",
  yearly: "Årsvis",
};
export const RECURRENCE_UNIT: Record<EventRecurrence["type"], string> = {
  none: "",
  daily: "dag",
  weekly: "vecka",
  monthly: "månad",
  yearly: "år",
};

// ── Types ────────────────────────────────────────────────────────────────────

export type FormState = {
  calendarId: string;
  title: string;
  isAllDay: boolean;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  recurrenceType: EventRecurrence["type"];
  recurrenceInterval: number;
  recurrenceUntil: string;
  attendeeIds: string[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function toLocalDateTimeStr(date: Date) {
  return `${toLocalDateStr(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtFullDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso + (iso.length === 10 ? "T12:00" : "")));
}

export function addInterval(date: Date, type: EventRecurrence["type"], interval: number): Date {
  const d = new Date(date);
  if (type === "daily") d.setDate(d.getDate() + interval);
  else if (type === "weekly") d.setDate(d.getDate() + 7 * interval);
  else if (type === "monthly") d.setMonth(d.getMonth() + interval);
  else if (type === "yearly") d.setFullYear(d.getFullYear() + interval);
  return d;
}

export function blankForm(defaults: Partial<FormState> = {}): FormState {
  return {
    calendarId: "",
    title: "",
    isAllDay: false,
    startsAt: "",
    endsAt: "",
    location: "",
    notes: "",
    recurrenceType: "none",
    recurrenceInterval: 1,
    recurrenceUntil: "",
    attendeeIds: [],
    ...defaults,
  };
}

export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export const HELGDAG_RE = /helgdag|röd dag|nationaldag|jul(?:dag|afton)|påsk|midsommar|nyår|kristi\s+himmel|allhelgon|pingst|trettondagen?|valborg/i;

export function isHolidayEvent(ev: { title: string; calendarName: string }): boolean {
  return HELGDAG_RE.test(ev.title) || HELGDAG_RE.test(ev.calendarName);
}

export function getMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = startDow; i > 0; i--) cells.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
  for (let d = 1; d <= lastDate; d++) cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  const trailing = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
  for (let d = 1; d <= trailing; d++) cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  return cells;
}

export function expandForMonth<T extends { id: string; startsAt: string; endsAt: string; calendarColor: string; calendarName: string; recurrence?: { type: EventRecurrence["type"]; interval: number; until: string | null } | null }>(events: T[], year: number, month: number): T[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const result: T[] = [];

  for (const ev of events) {
    const rec = ev.recurrence ?? { type: "none" as const, interval: 1, until: null };
    if (rec.type === "none") {
      result.push(ev);
      continue;
    }

    const origStart = new Date(ev.startsAt);
    if (origStart > monthEnd) continue;

    const duration = new Date(ev.endsAt).getTime() - origStart.getTime();
    const until = rec.until ? new Date(rec.until) : null;

    // Fast-forward close to monthStart
    let cur = new Date(origStart);
    if (cur < monthStart) {
      const msPerStep = rec.type === "yearly" ? rec.interval * 365.25 * 86400000
        : rec.type === "monthly" ? rec.interval * 30.44 * 86400000
        : rec.type === "weekly" ? rec.interval * 7 * 86400000
        : rec.interval * 86400000;
      const skip = Math.max(0, Math.floor((monthStart.getTime() - cur.getTime()) / msPerStep) - 2);
      for (let i = 0; i < skip; i++) cur = addInterval(cur, rec.type, rec.interval);
      while (cur < monthStart) cur = addInterval(cur, rec.type, rec.interval);
    }

    let guard = 0;
    while (cur <= monthEnd && guard++ < 200) {
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
