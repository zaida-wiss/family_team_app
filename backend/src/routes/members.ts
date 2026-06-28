import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as members from "../services/membersService.js";
import { accountIdOf } from "../utils/memberUtils.js";

export const membersRouter = Router();

membersRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await members.getAllMembers(accountId));
});

membersRouter.post("/", requireAuth, async (req, res) => {
  res.status(201).json(await members.createMember(req.body));
});

membersRouter.patch("/:id", requireAuth, async (req, res) => {
  await members.updateMember(req.params.id, req.body);
  res.json({ ok: true });
});

membersRouter.delete("/:id", requireAuth, async (req, res) => {
  await members.deleteMember(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});

membersRouter.patch("/:id/restore", requireAuth, async (req, res) => {
  await members.restoreMember(req.params.id);
  res.json({ ok: true });
});
