import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as calendars from "../services/calendarsService.js";
import * as subscriptions from "../services/calendarSubscriptionsService.js";
import * as appleCalDav from "../services/appleCalDavService.js";

export const calendarsRouter = Router();

calendarsRouter.get("/", requireAuth, attachAccountId, async (req, res) => {
  const { from, until } = req.query as { from?: string; until?: string };
  res.json(await calendars.getAllCalendars(req.accountId!, req.memberId!, from, until));
});

calendarsRouter.post("/", requireAuth, attachAccountId, async (req, res) => {
  res.status(201).json(await calendars.createCalendar({ ...req.body, accountId: req.accountId! }));
});

// "Mina familjekonton" (2026-07-30) — mina egna kalendrar (shareAcrossMyAccounts)
// från mina ANDRA konton, läsbara här oavsett vilket konto jag råkar vara
// inloggad i just nu. Måste registreras FÖRE POST /:id/... nedan gör ingen
// skillnad (annan HTTP-metod/segmentantal), men följer samma "specifika
// literal-routes nära toppen"-princip som redan etablerad i filen.
calendarsRouter.get("/cross-account", requireAuth, attachAccountId, async (req, res) => {
  const { from, until } = req.query as { from?: string; until?: string };
  res.json(await calendars.getCrossAccountCalendars(req.userId!, req.accountId!, req.memberId!, from, until));
});

// Familjeanslutningar (ADR-0030-tillägg, 2026-07-30) — läsning av en
// ansluten familjs exponerade medlemmars kalendrar. Skiljer sig från
// /cross-account ovan (samma person, egna konton) — här är det en helt
// annan familj som valt att exponera sina medlemmar.
calendarsRouter.get("/connections", requireAuth, attachAccountId, async (req, res) => {
  const { from, until } = req.query as { from?: string; until?: string };
  res.json(await calendars.getConnectionCalendars(req.accountId!, req.memberId ?? null, from, until));
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

// Dashboard-synlighet (2026-08-11) — oberoende av /share ovan.
calendarsRouter.post("/:id/dashboard-visibility", requireAuth, attachAccountId, async (req, res) => {
  const { memberId } = req.body;
  await calendars.setDashboardVisibility(req.params.id, req.accountId!, memberId);
  res.json({ ok: true });
});

calendarsRouter.delete("/:id/dashboard-visibility/:memberId", requireAuth, attachAccountId, async (req, res) => {
  await calendars.removeDashboardVisibility(req.params.id, req.accountId!, req.params.memberId);
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

// ── CalDAV-anslutning, tvåvägssynk (ADR-0027) ───────────────────────────────────

// Apple-konton på KONTONIVÅ (2026-07-30, Zaidas beslut: "tvåvägssynken med
// apple kontot skall inte fyllas i inuti någon kalender utan på en högre
// nivå så att sedan kalendrar kan använda sig av tvåvägssynkens olika
// kalendrar") — Apple-ID/lösenordet loggas in EN gång här, sedan väljer
// varje enskild BMAD-kalender (routes nedan) bland de redan tillagda
// kontona istället för att skriva in creds på nytt. Måste registreras FÖRE
// /:id/caldav/apple nedan (samma ordningsprincip som redan dokumenterad
// flerstädes i den här filen, även om de i praktiken inte kolliderar —
// olika antal path-segment).
calendarsRouter.post("/caldav/apple-accounts", requireAuth, attachAccountId, async (req, res) => {
  const acc = await appleCalDav.addAppleAccount(req.accountId!, req.memberId!, req.body);
  res.status(201).json(acc);
});

calendarsRouter.get("/caldav/apple-accounts", requireAuth, attachAccountId, async (req, res) => {
  res.json(await appleCalDav.listAppleAccounts(req.accountId!));
});

calendarsRouter.delete("/caldav/apple-accounts/:appleAccountId", requireAuth, attachAccountId, async (req, res) => {
  await appleCalDav.removeAppleAccount(req.accountId!, req.params.appleAccountId);
  res.json({ ok: true });
});

// Listar kalendrarna på ett redan tillagt Apple-konto (ingen ny inloggning
// behövs) — anropas när man kopplar en ENSKILD BMAD-kalender till kontot.
calendarsRouter.post("/caldav/apple-accounts/:appleAccountId/calendars", requireAuth, attachAccountId, async (req, res) => {
  res.json(await appleCalDav.listCalendarsForAppleAccount(req.accountId!, req.params.appleAccountId));
});

calendarsRouter.post("/:id/caldav/apple", requireAuth, attachAccountId, async (req, res) => {
  const conn = await appleCalDav.connectAppleCalendar(req.params.id, req.accountId!, req.memberId!, req.body);
  res.status(201).json(conn);
});

calendarsRouter.delete("/:id/caldav/:connectionId", requireAuth, attachAccountId, async (req, res) => {
  await appleCalDav.disconnectAppleCalendar(req.params.id, req.accountId!, req.params.connectionId);
  res.json({ ok: true });
});

calendarsRouter.patch("/:id/caldav/:connectionId", requireAuth, attachAccountId, async (req, res) => {
  const { syncIntervalMinutes } = req.body as { syncIntervalMinutes: number };
  await appleCalDav.updateCalDavConnectionInterval(req.params.id, req.accountId!, req.params.connectionId, syncIntervalMinutes);
  res.json({ ok: true });
});

calendarsRouter.post("/:id/caldav/:connectionId/sync", requireAuth, attachAccountId, async (req, res) => {
  await appleCalDav.pullConnectionById(req.params.id, req.accountId!, req.params.connectionId);
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

// ADR-0025 — permanent tömning av papperskorgen.
calendarsRouter.post("/purge-trash", requireAuth, attachAccountId, async (req, res) => {
  await calendars.purgeTrash(req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});
