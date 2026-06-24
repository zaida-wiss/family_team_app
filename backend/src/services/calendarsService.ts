import { CalendarModel } from "../db/models/Calendar.js";
import type { IcsSubscription } from "../../../shared/types.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseIcsEvents(text: string) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  return unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => block.split("END:VEVENT")[0] ?? "")
    .map((block) => {
      const get = (key: string) => {
        const line = block.split(/\r?\n/).find((l) => l.startsWith(`${key}:`) || l.startsWith(`${key};`));
        return line ? line.slice(line.indexOf(":") + 1).trim() || null : null;
      };
      const dtstart = get("DTSTART");
      const dtend = get("DTEND");
      const title = get("SUMMARY") ?? "Importerad händelse";
      const uid = get("UID");

      const parseDate = (v: string | null) => {
        if (!v) return null;
        if (/^\d{8}T\d{6}Z$/.test(v))
          return `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(9,11)}:${v.slice(11,13)}:${v.slice(13,15)}Z`;
        if (/^\d{8}T\d{6}$/.test(v))
          return `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(9,11)}:${v.slice(11,13)}:${v.slice(13,15)}`;
        if (/^\d{8}$/.test(v))
          return `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T12:00:00.000Z`;
        return null;
      };

      const startsAt = parseDate(dtstart);
      const endsAt = parseDate(dtend) ?? startsAt;
      if (!startsAt || !endsAt) return null;

      const isAllDay = /^\d{8}$/.test(dtstart ?? "");
      const desc = get("DESCRIPTION");
      const loc = get("LOCATION");
      const notes = [desc, loc].filter(Boolean).join(" · ") || null;

      return { title, startsAt, endsAt, isAllDay, uid, notes };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
}

function applyFilters(
  events: ReturnType<typeof parseIcsEvents>,
  sub: IcsSubscription
) {
  return events.filter((ev) => {
    const date = ev.startsAt.slice(0, 10);
    if (sub.dateFrom && date < sub.dateFrom) return false;
    if (sub.dateTo && date > sub.dateTo) return false;
    const lower = ev.title.toLowerCase();
    if (sub.excludeWords.some((w: string) => lower.includes(w.toLowerCase()))) return false;
    if (sub.includeWords.length > 0 && !sub.includeWords.some((w: string) => lower.includes(w.toLowerCase()))) return false;
    return true;
  });
}

export async function syncSubscription(calendarId: string, sub: IcsSubscription) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) return;

  const fetchUrl = sub.url.replace(/^webcal:\/\//i, "https://");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let icsText: string;
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return;
    icsText = await res.text();
  } catch {
    clearTimeout(timeout);
    return;
  }

  const incoming = applyFilters(parseIcsEvents(icsText), sub);
  const incomingByUid = new Map(incoming.filter((e) => e.uid).map((e) => [e.uid!, e]));

  const now = new Date().toISOString();
  const SCHOOL_CLOSED = /stängningsdag|kompetensdag/i;
  const subId = sub.id;

  // Update or soft-delete existing subscription events
  for (const ev of calendar.events) {
    if (ev.subscriptionId !== subId || ev.deletedAt) continue;
    if (ev.uid && incomingByUid.has(ev.uid)) {
      const src = incomingByUid.get(ev.uid)!;
      ev.title = src.title;
      ev.startsAt = src.startsAt;
      ev.endsAt = src.endsAt;
      ev.isAllDay = src.isAllDay;
      ev.notes = src.notes ?? null;
      incomingByUid.delete(ev.uid); // already handled
    } else {
      ev.deletedAt = now;
      ev.deletedBy = null;
    }
  }

  // Add genuinely new events
  const existingUids = new Set(calendar.events.filter((e) => e.subscriptionId === subId).map((e) => e.uid));
  for (const src of incoming) {
    if (src.uid && existingUids.has(src.uid)) continue;
    const color = SCHOOL_CLOSED.test(src.title) ? "#e07000" : null;
    calendar.events.push({
      id: `event-${crypto.randomUUID()}`,
      calendarId,
      title: src.title,
      startsAt: src.startsAt,
      endsAt: src.endsAt,
      isAllDay: src.isAllDay,
      color,
      uid: src.uid ?? null,
      subscriptionId: subId,
      location: null,
      notes: src.notes ?? null,
      recurrence: { type: "none", interval: 1, until: null },
      attendees: [],
      createdBy: calendar.ownerId,
      deletedAt: null,
      deletedBy: null
    } as any);
  }

  sub.lastSyncedAt = now;
  calendar.markModified("events");
  calendar.markModified("subscriptions");
  await calendar.save();
}

export async function getAllCalendars() {
  return CalendarModel.find({}, { _id: 0, __v: 0 });
}

export async function createCalendar(data: unknown) {
  const calendar = new CalendarModel({ ...(data as object), subscriptions: [] });
  await calendar.save();
  return { id: calendar.id };
}

export async function addEvent(calendarId: string, event: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  calendar.events.push(event as any);
  await calendar.save();
}

export async function shareCalendar(calendarId: string, memberId: string, access: "view" | "edit") {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const existing = calendar.sharedWith.find((s) => s.memberId === memberId);
  if (existing) { existing.access = access; }
  else { calendar.sharedWith.push({ memberId, access }); }
  calendar.markModified("sharedWith");
  await calendar.save();
}

export async function unshareCalendar(calendarId: string, memberId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  calendar.sharedWith = calendar.sharedWith.filter((s) => s.memberId !== memberId);
  calendar.markModified("sharedWith");
  await calendar.save();
}

export async function createSubscription(calendarId: string, body: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const b = body as { url: string; includeWords?: string[]; excludeWords?: string[]; dateFrom?: string | null; dateTo?: string | null; displaySymbol?: string | null };
  const sub: IcsSubscription = {
    id: `sub-${crypto.randomUUID()}`,
    calendarId,
    url: b.url,
    includeWords: b.includeWords ?? [],
    excludeWords: b.excludeWords ?? [],
    dateFrom: b.dateFrom ?? null,
    dateTo: b.dateTo ?? null,
    lastSyncedAt: null,
    displaySymbol: b.displaySymbol ?? null
  };
  calendar.subscriptions.push(sub as any);
  calendar.markModified("subscriptions");
  await calendar.save();
  // Sync immediately in background
  syncSubscription(calendarId, sub).catch((e) => logger.error(e));
  return sub;
}

export async function updateSubscription(calendarId: string, subId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const sub = calendar.subscriptions.find((s) => s.id === subId);
  if (!sub) {
    throw new AppError(404, "Prenumeration hittades inte");
  }
  const { includeWords, excludeWords, dateFrom, dateTo, displaySymbol } = patch as { includeWords?: string[]; excludeWords?: string[]; dateFrom?: string; dateTo?: string; displaySymbol?: string | null };
  if (includeWords !== undefined) sub.includeWords = includeWords;
  if (excludeWords !== undefined) sub.excludeWords = excludeWords;
  if (dateFrom !== undefined) sub.dateFrom = dateFrom;
  if (dateTo !== undefined) sub.dateTo = dateTo;
  if (displaySymbol !== undefined) (sub as IcsSubscription).displaySymbol = displaySymbol;
  calendar.markModified("subscriptions");
  await calendar.save();
}

export async function deleteSubscription(calendarId: string, subId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const now = new Date().toISOString();
  for (const ev of calendar.events) {
    if (ev.subscriptionId === subId && !ev.deletedAt) {
      ev.deletedAt = now;
    }
  }
  calendar.subscriptions = calendar.subscriptions.filter((s) => s.id !== subId) as any;
  calendar.markModified("events");
  calendar.markModified("subscriptions");
  await calendar.save();
}

export async function syncSubscriptionById(calendarId: string, subId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const sub = calendar.subscriptions.find((s) => s.id === subId);
  if (!sub) {
    throw new AppError(404, "Prenumeration hittades inte");
  }
  await syncSubscription(calendarId, sub as unknown as IcsSubscription);
}

export async function fetchIcs(url: string): Promise<string> {
  const normalizedUrl = url.replace(/^webcal:\/\//i, "https://");
  if (!normalizedUrl || !/^https?:\/\/.+/.test(normalizedUrl)) {
    throw new AppError(400, "Ogiltig URL – måste börja med http://, https:// eller webcal://");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const icsResponse = await fetch(normalizedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!icsResponse.ok) {
      throw new AppError(502, "Kunde inte hämta kalender från URL");
    }
    return icsResponse.text();
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof AppError) throw err;
    throw new AppError(502, "Tidsgräns nådd – kontrollera URL:en");
  }
}

export async function importEvents(calendarId: string, source: unknown, events: unknown[]) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  calendar.importedSources.push(source as any);
  for (const event of events) { calendar.events.push(event as any); }
  await calendar.save();
}

export async function updateEvent(calendarId: string, eventId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const event = calendar.events.find((e) => e.id === eventId);
  if (!event) {
    throw new AppError(404, "Händelse hittades inte");
  }
  Object.assign(event, patch);
  calendar.markModified("events");
  await calendar.save();
}

export async function deleteEvent(calendarId: string, eventId: string, memberId: string | null) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const event = calendar.events.find((e) => e.id === eventId);
  if (!event) {
    throw new AppError(404, "Händelse hittades inte");
  }
  event.deletedAt = new Date().toISOString();
  event.deletedBy = memberId;
  calendar.markModified("events");
  await calendar.save();
}

export async function rsvpEvent(calendarId: string, eventId: string, memberId: string, status: "pending" | "accepted" | "declined") {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const event = calendar.events.find((e) => e.id === eventId);
  if (!event) {
    throw new AppError(404, "Händelse hittades inte");
  }
  const attendee = event.attendees?.find((a) => a.memberId === memberId);
  if (attendee) { attendee.status = status; }
  calendar.markModified("events");
  await calendar.save();
}

export async function updateCalendar(calendarId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  const { color, name, ownerId } = patch as { color?: string; name?: string; ownerId?: string };
  if (color) calendar.color = color;
  if (name) calendar.name = name;
  if (ownerId) calendar.ownerId = ownerId;
  await calendar.save();
}

export async function deleteCalendar(calendarId: string, memberId: string | null) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  calendar.deletedAt = new Date().toISOString();
  calendar.deletedBy = memberId;
  await calendar.save();
}

export async function restoreCalendar(calendarId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) {
    throw new AppError(404, "Kalender hittades inte");
  }
  calendar.deletedAt = null;
  calendar.deletedBy = null;
  await calendar.save();
}
