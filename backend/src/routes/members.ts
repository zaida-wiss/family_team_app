import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as members from "../services/membersService.js";

export const membersRouter = Router();
membersRouter.use(requireAuth, attachAccountId);

membersRouter.get("/", async (req, res) => {
  res.json(await members.getAllMembers(req.accountId!));
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
