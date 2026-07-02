import { CalendarModel } from "../db/models/Calendar.js";
import type { IcsSubscription } from "../../../shared/types.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { validateAndNormalizeIcsUrl } from "../utils/icsUrl.js";
import { convertSiteVisionEventsToIcs } from "../utils/siteVisionEvents.js";

// Tolererar en URL som inte pekar på en färdig ICS-fil utan på en sida som
// råkar bädda in evenemang i SiteVisions "SchoolBreakListing"-format (se
// siteVisionEvents.ts). Vanliga ICS-flöden går igenom oförändrade.
function resolveIcsText(rawText: string): string {
  if (rawText.includes("BEGIN:VCALENDAR")) return rawText;
  return convertSiteVisionEventsToIcs(rawText) ?? rawText;
}

// ── ICS-parsning (privat) ─────────────────────────────────────────────────────

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
      const parsedEndsAt = parseDate(dtend) ?? startsAt;
      if (!startsAt || !parsedEndsAt) return null;

      const isAllDay = /^\d{8}$/.test(dtstart ?? "");
      const endsAt = normalizeAllDayIcsEnd(startsAt, parsedEndsAt, dtstart, dtend);
      const desc = get("DESCRIPTION");
      const loc = get("LOCATION");
      const notes = [desc, loc].filter(Boolean).join(" · ") || null;

      return { title, startsAt, endsAt, isAllDay, uid, notes };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);
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

// ── Prenumerations-CRUD och synk ──────────────────────────────────────────────

export async function createSubscription(calendarId: string, body: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const b = body as {
    url: unknown;
    includeWords?: string[];
    excludeWords?: string[];
    dateFrom?: string | null;
    dateTo?: string | null;
    displaySymbol?: string | null;
  };
  const sub: IcsSubscription = {
    id: `sub-${crypto.randomUUID()}`,
    calendarId,
    url: validateAndNormalizeIcsUrl(b.url),
    includeWords: b.includeWords ?? [],
    excludeWords: b.excludeWords ?? [],
    dateFrom: b.dateFrom ?? null,
    dateTo: b.dateTo ?? null,
    lastSyncedAt: null,
    displaySymbol: b.displaySymbol ?? null,
  };
  calendar.subscriptions.push(sub as any);
  calendar.markModified("subscriptions");
  await calendar.save();
  syncSubscription(calendarId, sub).catch((e) => logger.error(e));
  return sub;
}

export async function updateSubscription(calendarId: string, subId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const sub = calendar.subscriptions.find((s) => s.id === subId);
  if (!sub) throw new AppError(404, "Prenumeration hittades inte");

  const { includeWords, excludeWords, dateFrom, dateTo, displaySymbol } = patch as {
    includeWords?: string[];
    excludeWords?: string[];
    dateFrom?: string;
    dateTo?: string;
    displaySymbol?: string | null;
  };
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
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const now = new Date().toISOString();
  for (const ev of calendar.events) {
    if (ev.subscriptionId === subId && !ev.deletedAt) ev.deletedAt = now;
  }
  calendar.subscriptions = calendar.subscriptions.filter((s) => s.id !== subId) as any;
  calendar.markModified("events");
  calendar.markModified("subscriptions");
  await calendar.save();
}

export async function syncSubscriptionById(calendarId: string, subId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const sub = calendar.subscriptions.find((s) => s.id === subId);
  if (!sub) throw new AppError(404, "Prenumeration hittades inte");

  await syncSubscription(calendarId, sub as unknown as IcsSubscription);
}

export async function fetchIcs(url: unknown): Promise<string> {
  const normalizedUrl = validateAndNormalizeIcsUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const icsResponse = await fetch(normalizedUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!icsResponse.ok) throw new AppError(502, "Kunde inte hämta kalender från URL");
    return resolveIcsText(await icsResponse.text());
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof AppError) throw err;
    throw new AppError(502, "Tidsgräns nådd – kontrollera URL:en");
  }
}

export async function syncSubscription(calendarId: string, sub: IcsSubscription) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) return;

  const fetchUrl = sub.url.replace(/^webcal:\/\//i, "https://");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  let icsText: string;
  try {
    const res = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return;
    icsText = resolveIcsText(await res.text());
  } catch {
    clearTimeout(timeout);
    return;
  }

  const nowDate = new Date();
  const nowStr = nowDate.toISOString();
  const sub3mAgo = new Date(nowDate); sub3mAgo.setMonth(sub3mAgo.getMonth() - 3);
  const cutoffSub = sub3mAgo.toISOString().slice(0, 10);
  const sub1mAgo = new Date(nowDate); sub1mAgo.setMonth(sub1mAgo.getMonth() - 1);
  const cutoffAll = sub1mAgo.toISOString().slice(0, 10);

  const incoming = applyFilters(parseIcsEvents(icsText), sub)
    .filter((ev) => ev.startsAt.slice(0, 10) >= cutoffSub);
  const incomingByUid = new Map(incoming.filter((e) => e.uid).map((e) => [e.uid!, e]));

  const SCHOOL_CLOSED = /stängningsdag|kompetensdag/i;
  const subId = sub.id;

  for (const ev of calendar.events) {
    if (ev.subscriptionId !== subId || ev.deletedAt) continue;
    if ((ev.startsAt ?? "").slice(0, 10) < cutoffSub) continue;
    if (ev.uid && incomingByUid.has(ev.uid)) {
      const src = incomingByUid.get(ev.uid)!;
      ev.title = src.title;
      ev.startsAt = src.startsAt;
      ev.endsAt = src.endsAt;
      ev.isAllDay = src.isAllDay;
      ev.notes = src.notes ?? null;
      incomingByUid.delete(ev.uid);
    } else {
      ev.deletedAt = nowStr;
      ev.deletedBy = null;
    }
  }

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
      deletedBy: null,
    } as any);
  }

  const keepAllHistory = (calendar as any).keepAllHistory ?? false;
  const beforeCount = calendar.events.length;
  calendar.events = (calendar.events as any[]).filter((ev) => {
    const d = (ev.startsAt ?? "").slice(0, 10);
    if (ev.subscriptionId) return d >= cutoffSub;
    return keepAllHistory || d >= cutoffAll;
  }) as any;
  if (calendar.events.length !== beforeCount) calendar.markModified("events");

  sub.lastSyncedAt = nowStr;
  calendar.markModified("subscriptions");
  await calendar.save();
}
