import type { Calendar, EventRecurrence } from "@shared/types";
import { isoToTimeInput } from "../../utils/fixedTimeZone";

// Vilken symbol en händelse ska visas med (2026-07-27 fix, Zaidas fynd: "om
// jag uppdaterar en importerad kalenderhändelse med emoji så vill jag att den
// emojin skall synas... i nuläget blir det bara text") — tre ställen
// (useCalendarView.ts, CalendarTimelineView.tsx, ChildTimeline.tsx)
// beräknade tidigare var sin, INKONSEKVENTA variant av detta: alla lät en
// prenumererad händelses EGEN, manuellt satta symbol (event.symbol) bli
// helt överkörd av prenumerationens gemensamma standardsymbol (eller null,
// om ingen standard fanns) så fort event.subscriptionId var satt — en
// användare som redigerade EN specifik importerad händelse och gav den en
// egen emoji såg alltså aldrig effekten, oavsett vy. Rätt prioritet:
// händelsens EGEN symbol vinner alltid när den finns, prenumerationens
// standard är bara en fallback för händelser som aldrig fått en egen.
export function resolveDisplaySymbol(
  event: { symbol: string | null; subscriptionId: string | null },
  subscriptionSymbols: Map<string, string>
): string | null {
  if (event.symbol) return event.symbol;
  if (event.subscriptionId) return subscriptionSymbols.get(event.subscriptionId) ?? null;
  return null;
}

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
  symbol: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// fixedCalendarTimes (2026-07-30) — samma "10:00 förblir alltid 10:00
// oavsett var enheten befinner sig"-princip som todos/rutiner redan har
// (fixedTodoTimes), en HELT EGEN inställning. Standard (false, oförändrat
// beteende): visar enhetens egen aktuella tidszon.
export function fmtTime(iso: string, fixedCalendarTimes = false) {
  return isoToTimeInput(iso, fixedCalendarTimes);
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
    symbol: defaults.symbol ?? "",
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

export function expandForRange<T extends {
  id: string; startsAt: string; endsAt: string;
  calendarColor: string; calendarName: string;
  recurrence?: { type: EventRecurrence["type"]; interval: number; until: string | null } | null;
}>(events: T[], from: Date, to: Date): T[] {
  const result: T[] = [];
  for (const ev of events) {
    const rec = ev.recurrence ?? { type: "none" as const, interval: 1, until: null };
    if (rec.type === "none") {
      if (new Date(ev.startsAt) <= to && new Date(ev.endsAt) >= from) result.push(ev);
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

export type WeekCalendarDay = {
  dateStr: string;
  events: { id: string; title: string; startsAt: string; endsAt: string; isAllDay: boolean; color: string }[];
};

// Hem-vyns familjedashboards "veckans kalender" (2026-08-30, Zaida: "just
// nu finns inte veckans kalender med, den vågräta tidslinjen för varje
// dag") — en kompakt, LÄSBAR-ENDAST händelseöversikt per veckodag, renderad
// av FamilyWeekRoutines.tsx ovanför dess redan befintliga rutin-ikonrader.
// Återanvänder expandForRange (samma återkommelse-expansion som Kalender-
// panelens egen vecko-/månadsvy redan gör, se useCalendarView.ts) men en
// betydligt enklare enrichment än den filens calendarDisplayColor-
// uppslagning (ingen de-dup mellan överlappande medlemsfärger behövs för en
// passiv, icke-klickbar översikt) — Zaidas val: händelsens EGEN färg, annars
// kalenderns, aldrig en medlemsfärg.
//
// `days` (2026-08-31): default 3 (idag + 2 dagar fram), inte en hel vecka —
// se motsvarande kommentar på getFamilyWeekRoutines (selectors.ts).
export function getFamilyWeekCalendarEvents(calendars: Calendar[], weekStart: Date, days = 3): WeekCalendarDay[] {
  const weekEnd = new Date(weekStart.getTime() + days * 86_400_000);
  const enriched = calendars.flatMap((cal) =>
    cal.events
      .filter((ev) => ev.deletedAt === null)
      .map((ev) => ({ ...ev, calendarColor: cal.color, calendarName: cal.name }))
  );
  const expanded = expandForRange(enriched, weekStart, weekEnd);

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(weekStart.getTime() + i * 86_400_000);
    const dateStr = toLocalDateStr(date);
    const events = expanded
      .filter((ev) => toLocalDateStr(new Date(ev.startsAt)) === dateStr)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        isAllDay: ev.isAllDay,
        color: ev.color ?? ev.calendarColor,
      }));
    return { dateStr, events };
  });
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
