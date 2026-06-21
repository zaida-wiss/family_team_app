import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { MemberModel } from "../db/models/Member.js";

export const membersRouter = Router();

membersRouter.get("/", async (_request, response) => {
  const members = await MemberModel.find({}, { _id: 0, __v: 0 });
  response.json(members);
});

membersRouter.post("/", requireAuth, async (request, response) => {
  const member = new MemberModel(request.body);
  await member.save();
  response.status(201).json({ id: member.id });
});

membersRouter.patch("/:id", requireAuth, async (request, response) => {
  const member = await MemberModel.findOne({ id: request.params.id });
  if (!member) {
    response.status(404).json({ error: "Medlem hittades inte" });
    return;
  }
  Object.assign(member, request.body);
  await member.save();
  response.json({ ok: true });
});

membersRouter.delete("/:id", requireAuth, async (request, response) => {
  const member = await MemberModel.findOne({ id: request.params.id });
  if (!member) {
    response.status(404).json({ error: "Medlem hittades inte" });
    return;
  }
  member.deletedAt = new Date().toISOString();
  member.deletedBy = request.memberId ?? null;
  await member.save();
  response.json({ ok: true });
});

membersRouter.patch("/:id/restore", requireAuth, async (request, response) => {
  const member = await MemberModel.findOne({ id: request.params.id });
  if (!member) {
    response.status(404).json({ error: "Medlem hittades inte" });
    return;
  }
  member.deletedAt = null;
  member.deletedBy = null;
  await member.save();
  response.json({ ok: true });
});
