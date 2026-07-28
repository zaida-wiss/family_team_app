import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as members from "../services/membersService.js";
import * as childShares from "../services/childSharesService.js";
import * as childTransfer from "../services/childTransferService.js";
import { addMemberEventsClient } from "../realtime/memberEvents.js";

export const membersRouter = Router();
membersRouter.use(requireAuth, attachAccountId);

membersRouter.get("/", async (req, res) => {
  res.json(await members.getAllMembers(req.accountId!));
});

// Mina familjekonton (2026-07-25) — mina EGNA medlemskap, oavsett aktivt
// konto. Måste registreras FÖRE "/:id"-rutterna av samma skäl som "/events"
// nedan.
membersRouter.get("/my-memberships", async (req, res) => {
  res.json(await members.getMyMemberships(req.userId!));
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

// Mina väntande barn-delningar att godkänna/avböja (2026-07-29, ADR-0024-
// uppföljning) — måste registreras FÖRE "/:id"-rutterna nedan, av samma skäl
// som "/my-memberships"/"/events" ovan.
membersRouter.get("/pending-child-shares", async (req, res) => {
  res.json(await childShares.getPendingSharesForMe(req.memberId!, req.accountId!));
});

membersRouter.post("/pending-child-shares/:childAccountId/:childId/accept", async (req, res) => {
  await childShares.acceptShare(req.params.childId, req.params.childAccountId, req.memberId!, req.accountId!);
  res.json({ ok: true });
});

membersRouter.post("/pending-child-shares/:childAccountId/:childId/decline", async (req, res) => {
  await childShares.declineShare(req.params.childId, req.params.childAccountId, req.memberId!, req.accountId!);
  res.json({ ok: true });
});

membersRouter.post("/", async (req, res) => {
  res.status(201).json(await members.createMember(req.accountId!, req.memberId ?? null, req.body));
});

membersRouter.patch("/:id", async (req, res) => {
  await members.updateMember(req.params.id, req.accountId!, req.memberId ?? null, req.body);
  res.json({ ok: true });
});

membersRouter.delete("/:id", async (req, res) => {
  await members.deleteMember(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

membersRouter.patch("/:id/restore", async (req, res) => {
  await members.restoreMember(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

// ADR-0025 — permanent tömning av papperskorgen.
membersRouter.post("/purge-trash", async (req, res) => {
  await members.purgeTrash(req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

membersRouter.put("/:id/credentials", async (req, res) => {
  const result = await members.setChildCredentials(req.accountId!, req.memberId ?? null, req.params.id, req.body);
  res.json(result);
});

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024).
membersRouter.get("/:id/share", async (req, res) => {
  res.json(await childShares.listShares(req.params.id, req.accountId!, req.memberId ?? null));
});

membersRouter.post("/:id/share/lookup", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  res.json(await childShares.lookupShareCandidate(req.params.id, req.accountId!, req.memberId ?? null, email));
});

membersRouter.post("/:id/share", async (req, res) => {
  const result = await childShares.shareChild(req.params.id, req.accountId!, req.memberId ?? null, req.body);
  res.status(201).json(result);
});

membersRouter.delete("/:id/share/:granteeAccountId/:granteeMemberId", async (req, res) => {
  await childShares.revokeShare(
    req.params.id,
    req.accountId!,
    req.memberId ?? null,
    req.params.granteeMemberId,
    req.params.granteeAccountId
  );
  res.json({ ok: true });
});

// Överför ett barn permanent till en annan familj (2026-07-27) — samma
// e-postuppslag som delning (share/lookup ovan) återanvänds av frontend för
// att hitta mottagaren, den här routen utför själva flytten.
membersRouter.post("/:id/transfer", async (req, res) => {
  const { targetMemberId, targetAccountId } = req.body ?? {};
  if (typeof targetMemberId !== "string" || typeof targetAccountId !== "string") {
    res.status(400).json({ error: "targetMemberId och targetAccountId krävs" });
    return;
  }
  const result = await childTransfer.transferChild(
    req.params.id,
    req.accountId!,
    req.memberId ?? null,
    targetMemberId,
    targetAccountId
  );
  res.json(result);
});
