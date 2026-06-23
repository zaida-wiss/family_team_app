import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { CalendarModel } from "../db/models/Calendar.js";
import type { IcsSubscription } from "../../../shared/types.js";

export const calendarsRouter = Router();

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let icsText: string;
  try {
    const res = await fetch(sub.url, { signal: controller.signal });
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

// ── routes ────────────────────────────────────────────────────────────────────

calendarsRouter.get("/", async (_request, response) => {
  const calendars = await CalendarModel.find({}, { _id: 0, __v: 0 });
  response.json(calendars);
});

calendarsRouter.post("/", requireAuth, async (request, response) => {
  const calendar = new CalendarModel({ ...request.body, subscriptions: [] });
  await calendar.save();
  response.status(201).json({ id: calendar.id });
});

calendarsRouter.post("/:id/events", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  calendar.events.push(request.body);
  await calendar.save();
  response.status(201).json({ ok: true });
});

calendarsRouter.post("/:id/share", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const { memberId, access } = request.body;
  const existing = calendar.sharedWith.find((s) => s.memberId === memberId);
  if (existing) { existing.access = access; }
  else { calendar.sharedWith.push({ memberId, access }); }
  calendar.markModified("sharedWith");
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.delete("/:id/share/:memberId", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  calendar.sharedWith = calendar.sharedWith.filter((s) => s.memberId !== request.params.memberId);
  calendar.markModified("sharedWith");
  await calendar.save();
  response.json({ ok: true });
});

// ── subscriptions ─────────────────────────────────────────────────────────────

calendarsRouter.post("/:id/subscriptions", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const sub: IcsSubscription = {
    id: `sub-${crypto.randomUUID()}`,
    calendarId: request.params.id,
    url: request.body.url,
    includeWords: request.body.includeWords ?? [],
    excludeWords: request.body.excludeWords ?? [],
    dateFrom: request.body.dateFrom ?? null,
    dateTo: request.body.dateTo ?? null,
    lastSyncedAt: null
  };
  calendar.subscriptions.push(sub as any);
  calendar.markModified("subscriptions");
  await calendar.save();
  // Sync immediately in background
  syncSubscription(request.params.id, sub).catch(console.error);
  response.status(201).json(sub);
});

calendarsRouter.patch("/:id/subscriptions/:subId", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const sub = calendar.subscriptions.find((s) => s.id === request.params.subId);
  if (!sub) { response.status(404).json({ error: "Prenumeration hittades inte" }); return; }
  const { includeWords, excludeWords, dateFrom, dateTo } = request.body;
  if (includeWords !== undefined) sub.includeWords = includeWords;
  if (excludeWords !== undefined) sub.excludeWords = excludeWords;
  if (dateFrom !== undefined) sub.dateFrom = dateFrom;
  if (dateTo !== undefined) sub.dateTo = dateTo;
  calendar.markModified("subscriptions");
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.delete("/:id/subscriptions/:subId", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const subId = request.params.subId;
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
  response.json({ ok: true });
});

calendarsRouter.post("/:id/subscriptions/:subId/sync", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const sub = calendar.subscriptions.find((s) => s.id === request.params.subId);
  if (!sub) { response.status(404).json({ error: "Prenumeration hittades inte" }); return; }
  await syncSubscription(request.params.id, sub as unknown as IcsSubscription);
  response.json({ ok: true });
});

// ── ics fetch (for preview) ───────────────────────────────────────────────────

calendarsRouter.post("/:id/fetch-ics", requireAuth, async (request, response) => {
  const { url } = request.body as { url?: string };
  if (!url || !/^https?:\/\/.+/.test(url)) {
    response.status(400).json({ error: "Ogiltig URL – måste börja med http:// eller https://" });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const icsResponse = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!icsResponse.ok) { response.status(502).json({ error: "Kunde inte hämta kalender från URL" }); return; }
    const icsText = await icsResponse.text();
    response.json({ icsText });
  } catch {
    clearTimeout(timeout);
    response.status(502).json({ error: "Tidsgräns nådd – kontrollera URL:en" });
  }
});

calendarsRouter.post("/:id/import", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const { source, events } = request.body;
  calendar.importedSources.push(source);
  for (const event of events) { calendar.events.push(event); }
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.patch("/:id/events/:eventId", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const event = calendar.events.find((e) => e.id === request.params.eventId);
  if (!event) { response.status(404).json({ error: "Händelse hittades inte" }); return; }
  Object.assign(event, request.body);
  calendar.markModified("events");
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.delete("/:id/events/:eventId", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const event = calendar.events.find((e) => e.id === request.params.eventId);
  if (!event) { response.status(404).json({ error: "Händelse hittades inte" }); return; }
  event.deletedAt = new Date().toISOString();
  event.deletedBy = request.memberId ?? null;
  calendar.markModified("events");
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.patch("/:id/events/:eventId/rsvp", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const event = calendar.events.find((e) => e.id === request.params.eventId);
  if (!event) { response.status(404).json({ error: "Händelse hittades inte" }); return; }
  const { memberId, status } = request.body as { memberId: string; status: "pending" | "accepted" | "declined" };
  const attendee = event.attendees?.find((a) => a.memberId === memberId);
  if (attendee) { attendee.status = status; }
  calendar.markModified("events");
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.delete("/:id", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  calendar.deletedAt = new Date().toISOString();
  calendar.deletedBy = request.memberId ?? null;
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.patch("/:id/restore", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  calendar.deletedAt = null;
  calendar.deletedBy = null;
  await calendar.save();
  response.json({ ok: true });
});
