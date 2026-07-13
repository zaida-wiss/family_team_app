import { TimedTaskModel } from "../db/models/TimedTask.js";
import { TimedAttemptModel } from "../db/models/TimedAttempt.js";
import { AppError } from "../utils/errors.js";
import type { TimedAttempt, TimedTaskWithBest } from "../../../shared/types.js";

export async function getAllTimedTasks(accountId: string): Promise<TimedTaskWithBest[]> {
  const tasks = await TimedTaskModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).lean();
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);
  const attempts = await TimedAttemptModel.find(
    { timedTaskId: { $in: taskIds }, deletedAt: null },
    { _id: 0, __v: 0 }
  ).lean();

  const byTask = new Map<string, { bestDurationMs: number; bestAchievedAt: string; count: number }>();
  for (const attempt of attempts) {
    const current = byTask.get(attempt.timedTaskId);
    if (!current) {
      byTask.set(attempt.timedTaskId, {
        bestDurationMs: attempt.durationMs,
        bestAchievedAt: attempt.achievedAt,
        count: 1
      });
      continue;
    }
    current.count += 1;
    if (attempt.durationMs < current.bestDurationMs) {
      current.bestDurationMs = attempt.durationMs;
      current.bestAchievedAt = attempt.achievedAt;
    }
  }

  return tasks.map((task) => {
    const best = byTask.get(task.id);
    return {
      ...task,
      bestDurationMs: best?.bestDurationMs ?? null,
      bestAchievedAt: best?.bestAchievedAt ?? null,
      attemptCount: best?.count ?? 0
    };
  });
}

export async function createTimedTask(
  accountId: string,
  createdBy: string,
  data: { title: string; symbol?: string | null; assignedTo: string }
) {
  const task = new TimedTaskModel({
    id: `tt-${crypto.randomUUID()}`,
    accountId,
    title: data.title,
    symbol: data.symbol ?? null,
    assignedTo: data.assignedTo,
    createdBy,
    deletedAt: null,
    deletedBy: null
  });
  await task.save();
  return { id: task.id };
}

export async function deleteTimedTask(id: string, accountId: string, memberId: string | null) {
  const task = await TimedTaskModel.findOne({ id, accountId });
  if (!task || task.deletedAt) throw new AppError(404, "Tidtagen uppgift hittades inte");
  task.deletedAt = new Date().toISOString();
  task.deletedBy = memberId;
  await task.save();
}

// Barnet mäter tiden klientsidan (Date.now() vid start/stopp) och skickar bara den
// färdiga varaktigheten hit — inget "pågående försök"-tillstånd på servern som kan
// bli övergivet om fliken stängs mitt i.
export async function recordAttempt(
  timedTaskId: string,
  accountId: string,
  memberId: string,
  durationMs: number
) {
  const task = await TimedTaskModel.findOne({ id: timedTaskId, accountId, deletedAt: null });
  if (!task) throw new AppError(404, "Tidtagen uppgift hittades inte");

  const best = await TimedAttemptModel.findOne({ timedTaskId, deletedAt: null }).sort({ durationMs: 1 }).lean();
  const isNewRecord = !best || durationMs < best.durationMs;

  const attempt = new TimedAttemptModel({
    id: `ta-${crypto.randomUUID()}`,
    timedTaskId,
    memberId,
    durationMs,
    achievedAt: new Date().toISOString(),
    isNewRecord,
    deletedAt: null,
    deletedBy: null
  });
  await attempt.save();

  return {
    id: attempt.id,
    durationMs: attempt.durationMs,
    achievedAt: attempt.achievedAt,
    isNewRecord: attempt.isNewRecord
  };
}

// Redigera-modalen (2026-07-13, "vi ska kunna se våra rekord datum och antal
// försök per dag... vi ska kunna ta bort tider") — grupperingen (datum+antal
// per dag) görs klientsidan på den råa listan, ingen egen aggregerings-
// endpoint (listan är redan liten, en uppgifts alla försök).
export async function getAttemptsForTask(
  timedTaskId: string,
  accountId: string
): Promise<Omit<TimedAttempt, "deletedAt" | "deletedBy">[]> {
  const task = await TimedTaskModel.findOne({ id: timedTaskId, accountId, deletedAt: null });
  if (!task) throw new AppError(404, "Tidtagen uppgift hittades inte");

  const attempts = await TimedAttemptModel.find(
    { timedTaskId, deletedAt: null },
    { _id: 0, __v: 0, deletedAt: 0, deletedBy: 0 }
  )
    .sort({ achievedAt: -1 })
    .lean();
  return attempts;
}

// Mjuk radering (aldrig hard delete, se CLAUDE.md) — timedTaskId i frågan
// (inte bara attemptId) förhindrar att en manipulerad :id i URL:en raderar
// ett försök som hör till en ANNAN tidtagen uppgift.
export async function deleteAttempt(
  attemptId: string,
  timedTaskId: string,
  accountId: string,
  memberId: string | null
) {
  const task = await TimedTaskModel.findOne({ id: timedTaskId, accountId, deletedAt: null });
  if (!task) throw new AppError(404, "Tidtagen uppgift hittades inte");

  const attempt = await TimedAttemptModel.findOne({ id: attemptId, timedTaskId });
  if (!attempt || attempt.deletedAt) throw new AppError(404, "Försök hittades inte");
  attempt.deletedAt = new Date().toISOString();
  attempt.deletedBy = memberId;
  await attempt.save();
}
