import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as members from "../services/membersService.js";

export const membersRouter = Router();

membersRouter.get("/", async (_req, res) => {
  res.json(await members.getAllMembers());
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
