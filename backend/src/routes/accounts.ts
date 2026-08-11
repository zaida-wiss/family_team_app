import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as accountsService from "../services/accountsService.js";
import * as familyConnections from "../services/familyConnectionsService.js";
import * as members from "../services/membersService.js";

export const accountsRouter = Router();

accountsRouter.post("/setup", requireAuth, async (req, res) => {
  res.status(201).json(await accountsService.setupAccount(req.userId!, req.body));
});

accountsRouter.get("/:id", async (req, res) => {
  res.json(await accountsService.getAccount(req.params.id));
});

accountsRouter.put("/:id", requireAuth, async (req, res) => {
  await accountsService.updateAccount(req.params.id, req.memberId, req.body);
  res.json({ ok: true });
});

accountsRouter.get("/:id/export", requireAuth, async (req, res) => {
  const data = await accountsService.exportAccount(req.params.id, req.memberId);
  res.setHeader("Content-Disposition", `attachment; filename="bmad-export-${req.params.id}.json"`);
  res.json(data);
});

accountsRouter.delete("/:id", requireAuth, async (req, res) => {
  await accountsService.deleteAccount(req.params.id, req.memberId);
  res.json({ ok: true });
});

// Mina familjekonton (2026-07-29, Zaidas önskemål: "överlåta den till någon
// annan familjemedlem"/"radera familjer som jag skapat") — till skillnad
// från de två rutterna ovan (som förlitar sig på x-member-id/req.memberId
// och alltså bara fungerar för det just nu AKTIVA kontot) slår dessa upp
// anroparens medlemskap via userId, så de fungerar för VILKET av mina egna
// konton som helst, utan att först behöva växla till det.
accountsRouter.post("/:id/transfer-ownership", requireAuth, async (req, res) => {
  await accountsService.transferAccountOwnership(req.userId!, req.params.id, req.body);
  res.json({ ok: true });
});

accountsRouter.delete("/:id/as-creator", requireAuth, async (req, res) => {
  await accountsService.deleteMyCreatedAccount(req.userId!, req.params.id);
  res.json({ ok: true });
});

// Se vilka som ingår i / gå ur ett av mina egna konton (2026-07-29). Flyttade
// hit från membersRouter (som applicerar attachAccountId globalt på ALLA
// sina rutter) — de här handlarna slår upp anroparens medlemskap via
// userId + req.params.id direkt, precis som transfer-ownership/as-creator
// ovan, och behöver aldrig req.accountId/x-member-id.
accountsRouter.get("/:id/members", requireAuth, async (req, res) => {
  res.json(await members.getMembersOfMyAccount(req.userId!, req.params.id));
});

accountsRouter.post("/:id/leave", requireAuth, async (req, res) => {
  await members.leaveAccount(req.userId!, req.params.id);
  res.json({ ok: true });
});

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"), hanteras alltid i det AKTIVA kontot (req.memberId via
// x-member-id), till skillnad från transfer-ownership/as-creator ovan.
accountsRouter.post("/:id/family-connections/lookup", requireAuth, async (req, res) => {
  const { email } = req.body as { email?: string };
  res.json(await familyConnections.lookupConnectionCandidate(req.params.id, req.memberId ?? null, email ?? ""));
});

accountsRouter.post("/:id/family-connections", requireAuth, async (req, res) => {
  await familyConnections.sendInvitation(req.params.id, req.memberId ?? null, req.body);
  res.status(201).json({ ok: true });
});

accountsRouter.get("/:id/family-connections", requireAuth, async (req, res) => {
  res.json(await familyConnections.listMyConnections(req.params.id, req.memberId ?? null));
});

accountsRouter.get("/:id/family-connections/pending", requireAuth, async (req, res) => {
  res.json(await familyConnections.getPendingConnectionsForMe(req.params.id, req.memberId ?? null));
});

accountsRouter.post("/:id/family-connections/pending/:fromAccountId/accept", requireAuth, async (req, res) => {
  await familyConnections.acceptConnection(req.params.id, req.memberId ?? null, req.params.fromAccountId, req.body);
  res.json({ ok: true });
});

accountsRouter.post("/:id/family-connections/pending/:fromAccountId/decline", requireAuth, async (req, res) => {
  await familyConnections.declineConnection(req.params.id, req.memberId ?? null, req.params.fromAccountId);
  res.json({ ok: true });
});

accountsRouter.delete("/:id/family-connections/:connectionId", requireAuth, async (req, res) => {
  await familyConnections.revokeConnection(req.params.id, req.memberId ?? null, req.params.connectionId);
  res.json({ ok: true });
});
