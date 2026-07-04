import { TimedTaskModel } from "../db/models/TimedTask.js";
import { TimedAttemptModel } from "../db/models/TimedAttempt.js";
import { AppError } from "../utils/errors.js";
import type { TimedTaskWithBest } from "../../../shared/types.js";

export async function getAllTimedTasks(accountId: string): Promise<TimedTaskWithBest[]> {
  const tasks = await TimedTaskModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).lean();
  if (tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);
  const attempts = await TimedAttemptModel.find({ timedTaskId: { $in: taskIds } }, { _id: 0, __v: 0 }).lean();

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

  const best = await TimedAttemptModel.findOne({ timedTaskId }).sort({ durationMs: 1 }).lean();
  const isNewRecord = !best || durationMs < best.durationMs;

  const attempt = new TimedAttemptModel({
    id: `ta-${crypto.randomUUID()}`,
    timedTaskId,
    memberId,
    durationMs,
    achievedAt: new Date().toISOString(),
    isNewRecord
  });
  await attempt.save();

  return {
    id: attempt.id,
    durationMs: attempt.durationMs,
    achievedAt: attempt.achievedAt,
    isNewRecord: attempt.isNewRecord
  };
}
