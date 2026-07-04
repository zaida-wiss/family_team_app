import { TodoModel } from "../db/models/Todo.js";
import { MemberModel } from "../db/models/Member.js";
import { broadcastTodosChanged } from "../realtime/todoEvents.js";
import { AppError } from "../utils/errors.js";
import { TodoPatchSchema } from "../../../shared/schemas.js";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../utils/fieldEncryption.js";
import { writeAuditLog } from "./auditLogService.js";
import type { Todo } from "../../../shared/types.js";

export async function getAllTodos(accountId: string) {
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);

  const todos = await TodoModel.find(
    {
      accountId,
      $and: [
        // Soft-deleted: keep last 30 days for trash view
        { $or: [{ deletedAt: null }, { deletedAt: { $gte: cutoff30.toISOString() } }] },
        // Expired: keep last 30 days
        { $or: [{ status: { $ne: "expired" } }, { expiresAt: { $gte: cutoff30.toISOString() } }] },
        // Approved: keep last 7 days — total stars tracked on member.approvedStars
        { $or: [{ status: { $ne: "approved" } }, { approvedAt: { $gte: cutoff7.toISOString() } }] },
      ],
    },
    { _id: 0, __v: 0 }
  ).lean();

  return todos.map((todo) => ({
    ...todo,
    title: decryptField(accountId, todo.title),
    rejectedReason: decryptNullable(accountId, todo.rejectedReason) ?? null
  }));
}

export async function createTodo(data: unknown) {
  const existingId = getTodoId(data);
  if (existingId) {
    const existingTodo = await TodoModel.findOne({ id: existingId });
    if (existingTodo) {
      return { id: existingTodo.id };
    }
  }

  const input = data as Partial<Todo> & { accountId: string; title: string };
  const encrypted = {
    ...input,
    title: encryptField(input.accountId, input.title),
    rejectedReason: encryptNullable(input.accountId, input.rejectedReason) ?? null
  };

  const todo = new TodoModel(encrypted);
  try {
    await todo.save();
  } catch (error) {
    if (existingId && isDuplicateKeyError(error)) {
      const existingTodo = await TodoModel.findOne({ id: existingId });
      if (existingTodo) {
        return { id: existingTodo.id };
      }
    }

    throw error;
  }
  broadcastTodosChanged();
  return { id: todo.id };
}

function getTodoId(data: unknown) {
  if (!data || typeof data !== "object" || !("id" in data)) {
    return null;
  }

  const id = (data as Partial<Todo>).id;
  return typeof id === "string" ? id : null;
}

function isDuplicateKeyError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export async function completeTodo(id: string, accountId: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo || todo.status !== "pending") {
    throw new AppError(404, "Todo hittades inte eller är inte pending");
  }
  todo.status = "done";
  todo.completedAt = new Date().toISOString();
  await todo.save();
  broadcastTodosChanged();
}

export async function updateTodo(id: string, accountId: string, data: unknown) {
  const patch = TodoPatchSchema.parse(data);
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }

  if (patch.title !== undefined) patch.title = encryptField(accountId, patch.title);

  Object.assign(todo, patch);
  await todo.save();
  broadcastTodosChanged();
  return { ok: true };
}

export async function approveTodo(id: string, accountId: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  todo.status = "approved";
  todo.approvedBy = memberId;
  todo.approvedAt = new Date().toISOString();
  await todo.save();
  if (todo.assignedTo && todo.starValue) {
    await MemberModel.updateOne(
      { id: todo.assignedTo },
      { $inc: { approvedStars: todo.starValue } }
    );
    const member = await MemberModel.findOne({ id: todo.assignedTo });
    await writeAuditLog(
      accountId,
      "stars_approved",
      memberId,
      `Godkände ${todo.starValue} stjärnor för "${decryptField(accountId, todo.title)}" (${member?.name ?? "okänd medlem"})`
    );
  }
  broadcastTodosChanged();
}

export async function rejectTodo(id: string, accountId: string, memberId: string | null, reason: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  const encryptedReason = encryptNullable(accountId, reason) ?? null;
  if (canRetryRejectedTodo({ expiresAt: todo.expiresAt })) {
    todo.status = "pending";
    todo.completedAt = null;
    todo.approvedBy = null;
    todo.approvedAt = null;
    todo.rejectedBy = null;
    todo.rejectedAt = null;
    todo.rejectedReason = encryptedReason;
    await todo.save();
    broadcastTodosChanged();
    return;
  }

  todo.status = "rejected";
  todo.rejectedBy = memberId;
  todo.rejectedAt = new Date().toISOString();
  todo.rejectedReason = encryptedReason;
  await todo.save();
  broadcastTodosChanged();
}

function canRetryRejectedTodo(todo: { expiresAt: string | null }, now = Date.now()) {
  if (!todo.expiresAt) {
    return true;
  }

  return new Date(todo.expiresAt).getTime() > now;
}

export async function deleteTodo(id: string, accountId: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  todo.deletedAt = new Date().toISOString();
  todo.deletedBy = memberId;
  await todo.save();
  broadcastTodosChanged();
}

export async function restoreTodo(id: string, accountId: string) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  todo.deletedAt = null;
  todo.deletedBy = null;
  await todo.save();
  broadcastTodosChanged();
}

// Föräldravyn med delmoment (Sprint 6 S1) — bockar av/på ett enskilt delmoment,
// oberoende av complete/approve/reject-flödet. Lika vikt, ingen viktning (se
// discussions/2026-07-04-designspike-medaljer-och-foraldravy.md).
export async function toggleSubtask(id: string, accountId: string, subtaskId: string) {
  const todo = await TodoModel.findOne({ id, accountId });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  const subtask = todo.subtasks?.find((s) => s.id === subtaskId);
  if (!subtask) {
    throw new AppError(404, "Delmoment hittades inte");
  }
  subtask.done = !subtask.done;
  todo.markModified("subtasks");
  await todo.save();
  broadcastTodosChanged();
  return { done: subtask.done };
}
