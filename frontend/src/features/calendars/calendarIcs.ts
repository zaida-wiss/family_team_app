import type { Calendar } from "@shared/types";

export type ImportedCalendarEvent = {
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  color: string | null;
  notes: string | null;
  categories: string[];
};

const SCHOOL_CLOSED_RE = /stängningsdag|kompetensdag/i;
const LOV_RE = /\blov\b|^ledig|ledighet|sportlov|höstlov|jullov|påsklov|sommarlov|höstledigt|sommarledigt/i;
const HELGDAG_RE = /helgdag|röd dag|nationaldag|jul|påsk|midsommar|nyår|kristi|allhelgon|pingst/i;
export const SCHOOL_CLOSED_COLOR = "#e07000";

export function detectCategories(title: string, isAllDay: boolean, icsRaw: string[]): string[] {
  const cats = new Set<string>(icsRaw);
  if (SCHOOL_CLOSED_RE.test(title)) cats.add("Stängningsdag");
  else if (LOV_RE.test(title)) cats.add("Lov / Ledigt");
  else if (HELGDAG_RE.test(title)) cats.add("Helgdag");
  else if (isAllDay) cats.add("Heldag");
  else cats.add("Övrigt");
  return [...cats];
}

export function parseIcsEvents(text: string): ImportedCalendarEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  return unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => block.split("END:VEVENT")[0] ?? "")
    .map((block) => {
      const title = getIcsValue(block, "SUMMARY") ?? "Importerad händelse";
      const dtstart = getIcsValue(block, "DTSTART");
      const dtend = getIcsValue(block, "DTEND") ?? getIcsValue(block, "DURATION");
      const startsAt = parseIcsDate(dtstart);
      const parsedEndsAt = parseIcsDate(dtend) ?? startsAt;
      if (!startsAt || !parsedEndsAt) return null;
      const isAllDay = /^\d{8}$/.test(dtstart ?? "");
      const endsAt = normalizeAllDayIcsEnd(startsAt, parsedEndsAt, dtstart, dtend);
      const color = SCHOOL_CLOSED_RE.test(title) ? SCHOOL_CLOSED_COLOR : null;
      const description = getIcsValue(block, "DESCRIPTION");
      const location = getIcsValue(block, "LOCATION");
      const notes = [description, location].filter(Boolean).join(" · ") || null;
      const rawCats = (getIcsValue(block, "CATEGORIES") ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean);
      const categories = detectCategories(title, isAllDay, rawCats);
      return { title, startsAt, endsAt, isAllDay, color, notes, categories };
    })
    .filter((event): event is ImportedCalendarEvent => event !== null);
}

function normalizeAllDayIcsEnd(
  startsAt: string,
  endsAt: string,
  rawStart: string | null,
  rawEnd: string | null
) {
  if (!/^\d{8}$/.test(rawStart ?? "") || !/^\d{8}$/.test(rawEnd ?? "")) return endsAt;
  if (endsAt <= startsAt) return startsAt;
  return new Date(new Date(endsAt).getTime() - 86400000).toISOString();
}

function getIcsValue(block: string, key: string) {
  const line = block
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}:`) || l.startsWith(`${key};`));
  if (!line) return null;
  return line.slice(line.indexOf(":") + 1).trim() || null;
}

function parseIcsDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  }
  if (/^\d{8}T\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
  }
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00.000Z`;
  }
  return null;
}

export function toIcs(calendar: Calendar) {
  const events = calendar.events
    .filter((event) => event.deletedAt === null)
    .map((event) => [
      "BEGIN:VEVENT",
      `UID:${event.id}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      `DTSTART:${formatIcsDate(event.startsAt)}`,
      `DTEND:${formatIcsDate(event.endsAt)}`,
      event.notes ? `DESCRIPTION:${escapeIcs(event.notes)}` : null,
      "END:VEVENT"
    ].filter(Boolean).join("\r\n"))
    .join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Team App//SV",
    `X-WR-CALNAME:${escapeIcs(calendar.name)}`,
    events,
    "END:VCALENDAR"
  ].join("\r\n");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function filterByDateRange(
  events: ImportedCalendarEvent[],
  from: string,
  to: string
): ImportedCalendarEvent[] {
  if (!from && !to) return events;
  return events.filter((ev) => {
    const date = ev.startsAt.slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  });
}
