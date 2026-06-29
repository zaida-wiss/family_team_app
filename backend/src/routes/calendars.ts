import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as calendars from "../services/calendarsService.js";
import { accountIdOf } from "../utils/memberUtils.js";

export const calendarsRouter = Router();

calendarsRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  const { from, until } = req.query as { from?: string; until?: string };
  res.json(await calendars.getAllCalendars(accountId, from, until));
});

calendarsRouter.post("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.status(201).json(await calendars.createCalendar({ ...req.body, accountId }));
});

calendarsRouter.post("/:id/events", requireAuth, async (req, res) => {
  await calendars.addEvent(req.params.id, req.body);
  res.status(201).json({ ok: true });
});

calendarsRouter.post("/:id/share", requireAuth, async (req, res) => {
  const { memberId, access } = req.body;
  await calendars.shareCalendar(req.params.id, memberId, access);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id/share/:memberId", requireAuth, async (req, res) => {
  await calendars.unshareCalendar(req.params.id, req.params.memberId);
  res.json({ ok: true });
});

// ── subscriptions ─────────────────────────────────────────────────────────────

calendarsRouter.post("/:id/subscriptions", requireAuth, async (req, res) => {
  const sub = await calendars.createSubscription(req.params.id, req.body);
  res.status(201).json(sub);
});

calendarsRouter.patch("/:id/subscriptions/:subId", requireAuth, async (req, res) => {
  await calendars.updateSubscription(req.params.id, req.params.subId, req.body);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id/subscriptions/:subId", requireAuth, async (req, res) => {
  await calendars.deleteSubscription(req.params.id, req.params.subId);
  res.json({ ok: true });
});

calendarsRouter.post("/:id/subscriptions/:subId/sync", requireAuth, async (req, res) => {
  await calendars.syncSubscriptionById(req.params.id, req.params.subId);
  res.json({ ok: true });
});

// ── ics fetch (for preview) ───────────────────────────────────────────────────

calendarsRouter.post("/:id/fetch-ics", requireAuth, async (req, res) => {
  const rawUrl = (req.body as { url?: string }).url ?? "";
  const icsText = await calendars.fetchIcs(rawUrl);
  res.json({ icsText });
});

calendarsRouter.post("/:id/import", requireAuth, async (req, res) => {
  const { source, events } = req.body;
  await calendars.importEvents(req.params.id, source, events);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id/events/:eventId", requireAuth, async (req, res) => {
  await calendars.updateEvent(req.params.id, req.params.eventId, req.body);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id/events/:eventId", requireAuth, async (req, res) => {
  await calendars.deleteEvent(req.params.id, req.params.eventId, req.memberId ?? null);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id/events/:eventId/rsvp", requireAuth, async (req, res) => {
  const { memberId, status } = req.body as { memberId: string; status: "pending" | "accepted" | "declined" };
  await calendars.rsvpEvent(req.params.id, req.params.eventId, memberId, status);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id", requireAuth, async (req, res) => {
  await calendars.updateCalendar(req.params.id, req.body);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id", requireAuth, async (req, res) => {
  await calendars.deleteCalendar(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id/restore", requireAuth, async (req, res) => {
  await calendars.restoreCalendar(req.params.id);
  res.json({ ok: true });
});
