import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as members from "../services/membersService.js";
import { addMemberEventsClient } from "../realtime/memberEvents.js";

export const membersRouter = Router();
membersRouter.use(requireAuth, attachAccountId);

membersRouter.get("/", async (req, res) => {
  res.json(await members.getAllMembers(req.accountId!));
});

// Realtidssynk (2026-07-17) — samma SSE-mönster som todos/reward-shop redan
// använder. Måste registreras FÖRE "/:id"-rutterna nedan, annars matchar
// Express "events" som ett :id-värde.
membersRouter.get("/events", async (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  addMemberEventsClient(res);
});

membersRouter.post("/", async (req, res) => {
  res.status(201).json(await members.createMember(req.accountId!, req.body));
});

membersRouter.patch("/:id", async (req, res) => {
  await members.updateMember(req.params.id, req.accountId!, req.body);
  res.json({ ok: true });
});

membersRouter.delete("/:id", async (req, res) => {
  await members.deleteMember(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

membersRouter.patch("/:id/restore", async (req, res) => {
  await members.restoreMember(req.params.id, req.accountId!);
  res.json({ ok: true });
});
