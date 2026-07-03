import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as calendars from "../services/calendarsService.js";
import * as subscriptions from "../services/calendarSubscriptionsService.js";

export const calendarsRouter = Router();

calendarsRouter.get("/", requireAuth, attachAccountId, async (req, res) => {
  const { from, until } = req.query as { from?: string; until?: string };
  res.json(await calendars.getAllCalendars(req.accountId!, from, until));
});

calendarsRouter.post("/", requireAuth, attachAccountId, async (req, res) => {
  res.status(201).json(await calendars.createCalendar({ ...req.body, accountId: req.accountId! }));
});

calendarsRouter.post("/:id/events", requireAuth, attachAccountId, async (req, res) => {
  await calendars.addEvent(req.params.id, req.accountId!, req.memberId!, req.body);
  res.status(201).json({ ok: true });
});

calendarsRouter.post("/:id/share", requireAuth, attachAccountId, async (req, res) => {
  const { memberId, access } = req.body;
  await calendars.shareCalendar(req.params.id, req.accountId!, memberId, access);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id/share/:memberId", requireAuth, attachAccountId, async (req, res) => {
  await calendars.unshareCalendar(req.params.id, req.accountId!, req.params.memberId);
  res.json({ ok: true });
});

// ── subscriptions ─────────────────────────────────────────────────────────────

calendarsRouter.post("/:id/subscriptions", requireAuth, attachAccountId, async (req, res) => {
  const sub = await subscriptions.createSubscription(req.params.id, req.accountId!, req.body);
  res.status(201).json(sub);
});

calendarsRouter.patch("/:id/subscriptions/:subId", requireAuth, attachAccountId, async (req, res) => {
  await subscriptions.updateSubscription(req.params.id, req.accountId!, req.params.subId, req.body);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id/subscriptions/:subId", requireAuth, attachAccountId, async (req, res) => {
  await subscriptions.deleteSubscription(req.params.id, req.accountId!, req.params.subId);
  res.json({ ok: true });
});

calendarsRouter.post("/:id/subscriptions/:subId/sync", requireAuth, attachAccountId, async (req, res) => {
  await subscriptions.syncSubscriptionById(req.params.id, req.accountId!, req.params.subId);
  res.json({ ok: true });
});

// ── ics fetch (for preview) ───────────────────────────────────────────────────
// Ingen accountId behövs — hämtar bara en extern ICS-URL för förhandsvisning,
// sparar/läser inget kontoscopat.

calendarsRouter.post("/:id/fetch-ics", requireAuth, async (req, res) => {
  const icsText = await subscriptions.fetchIcs((req.body as { url?: unknown }).url);
  res.json({ icsText });
});

calendarsRouter.post("/:id/import", requireAuth, attachAccountId, async (req, res) => {
  const { source, events } = req.body;
  await calendars.importEvents(req.params.id, req.accountId!, req.memberId!, { source, events });
  res.json({ ok: true });
});

calendarsRouter.patch("/:id/events/:eventId", requireAuth, attachAccountId, async (req, res) => {
  await calendars.updateEvent(req.params.id, req.accountId!, req.params.eventId, req.body);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id/events/:eventId", requireAuth, attachAccountId, async (req, res) => {
  await calendars.deleteEvent(req.params.id, req.accountId!, req.params.eventId, req.memberId ?? null);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id/events/:eventId/rsvp", requireAuth, attachAccountId, async (req, res) => {
  const { memberId, status } = req.body as { memberId: string; status: "pending" | "accepted" | "declined" };
  await calendars.rsvpEvent(req.params.id, req.accountId!, req.params.eventId, memberId, status);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id", requireAuth, attachAccountId, async (req, res) => {
  await calendars.updateCalendar(req.params.id, req.accountId!, req.body);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id", requireAuth, attachAccountId, async (req, res) => {
  await calendars.deleteCalendar(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id/restore", requireAuth, attachAccountId, async (req, res) => {
  await calendars.restoreCalendar(req.params.id, req.accountId!);
  res.json({ ok: true });
});
