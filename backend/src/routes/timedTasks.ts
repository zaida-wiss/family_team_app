import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as timedTasks from "../services/timedTasksService.js";
import { CreateTimedTaskBodySchema, RecordTimedAttemptBodySchema } from "../../../shared/schemas.js";

export const timedTasksRouter = Router();
timedTasksRouter.use(requireAuth, attachAccountId);

timedTasksRouter.get("/", async (req, res) => {
  res.json(await timedTasks.getAllTimedTasks(req.accountId!));
});

timedTasksRouter.post("/", async (req, res) => {
  const body = CreateTimedTaskBodySchema.parse(req.body);
  res.status(201).json(await timedTasks.createTimedTask(req.accountId!, req.memberId ?? "", body));
});

timedTasksRouter.delete("/:id", async (req, res) => {
  await timedTasks.deleteTimedTask(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

timedTasksRouter.post("/:id/attempts", async (req, res) => {
  const { durationMs } = RecordTimedAttemptBodySchema.parse(req.body);
  const attempt = await timedTasks.recordAttempt(req.params.id, req.accountId!, req.memberId ?? "", durationMs);
  res.status(201).json(attempt);
});

// Redigera-modalen (2026-07-13) — datum/antal försök per dag samt
// linjediagrammet byggs klientsidan av den här listan.
timedTasksRouter.get("/:id/attempts", async (req, res) => {
  res.json(await timedTasks.getAttemptsForTask(req.params.id, req.accountId!));
});

timedTasksRouter.delete("/:id/attempts/:attemptId", async (req, res) => {
  await timedTasks.deleteAttempt(req.params.attemptId, req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});
