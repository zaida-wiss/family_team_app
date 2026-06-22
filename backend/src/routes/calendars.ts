import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { CalendarModel } from "../db/models/Calendar.js";

export const calendarsRouter = Router();

calendarsRouter.get("/", async (_request, response) => {
  const calendars = await CalendarModel.find({}, { _id: 0, __v: 0 });
  response.json(calendars);
});

calendarsRouter.post("/", requireAuth, async (request, response) => {
  const calendar = new CalendarModel(request.body);
  await calendar.save();
  response.status(201).json({ id: calendar.id });
});

calendarsRouter.post("/:id/events", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) {
    response.status(404).json({ error: "Kalender hittades inte" });
    return;
  }
  calendar.events.push(request.body);
  await calendar.save();
  response.status(201).json({ ok: true });
});

calendarsRouter.post("/:id/share", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) {
    response.status(404).json({ error: "Kalender hittades inte" });
    return;
  }
  const { memberId, access } = request.body;
  const existing = calendar.sharedWith.find((s) => s.memberId === memberId);
  if (existing) {
    existing.access = access;
  } else {
    calendar.sharedWith.push({ memberId, access });
  }
  calendar.markModified("sharedWith");
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.delete("/:id/share/:memberId", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) {
    response.status(404).json({ error: "Kalender hittades inte" });
    return;
  }
  calendar.sharedWith = calendar.sharedWith.filter((s) => s.memberId !== request.params.memberId);
  calendar.markModified("sharedWith");
  await calendar.save();
  response.json({ ok: true });
});

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
    if (!icsResponse.ok) {
      response.status(502).json({ error: "Kunde inte hämta kalender från URL" });
      return;
    }
    const icsText = await icsResponse.text();
    response.json({ icsText });
  } catch {
    clearTimeout(timeout);
    response.status(502).json({ error: "Tidsgräns nådd – kontrollera URL:en" });
  }
});

calendarsRouter.post("/:id/import", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) {
    response.status(404).json({ error: "Kalender hittades inte" });
    return;
  }
  const { source, events } = request.body;
  calendar.importedSources.push(source);
  for (const event of events) {
    calendar.events.push(event);
  }
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.patch("/:id/events/:eventId", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) { response.status(404).json({ error: "Kalender hittades inte" }); return; }
  const event = calendar.events.find((e) => e.id === request.params.eventId);
  if (!event) { response.status(404).json({ error: "Händelse hittades inte" }); return; }
  const updates = request.body as Partial<typeof event>;
  Object.assign(event, updates);
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
  const { memberId, status } = request.body as { memberId: string; status: string };
  const attendee = event.attendees?.find((a) => a.memberId === memberId);
  if (attendee) { attendee.status = status; }
  calendar.markModified("events");
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.delete("/:id", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) {
    response.status(404).json({ error: "Kalender hittades inte" });
    return;
  }
  calendar.deletedAt = new Date().toISOString();
  calendar.deletedBy = request.memberId ?? null;
  await calendar.save();
  response.json({ ok: true });
});

calendarsRouter.patch("/:id/restore", requireAuth, async (request, response) => {
  const calendar = await CalendarModel.findOne({ id: request.params.id });
  if (!calendar) {
    response.status(404).json({ error: "Kalender hittades inte" });
    return;
  }
  calendar.deletedAt = null;
  calendar.deletedBy = null;
  await calendar.save();
  response.json({ ok: true });
});
