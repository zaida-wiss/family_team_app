import { TodoModel } from "../db/models/Todo.js";
import { broadcastTodosChanged } from "../realtime/todoEvents.js";
import { AppError } from "../utils/errors.js";
import type { Todo } from "../../../shared/types.js";

export async function getAllTodos(accountId: string) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString();

  return TodoModel.find(
    {
      accountId,
      $and: [
        // Exclude soft-deleted todos older than 30 days
        { $or: [{ deletedAt: null }, { deletedAt: { $gte: cutoffIso } }] },
        // Exclude expired todos that expired more than 30 days ago
        { $or: [{ status: { $ne: "expired" } }, { expiresAt: { $gte: cutoffIso } }] },
      ],
    },
    { _id: 0, __v: 0 }
  );
}

export async function createTodo(data: unknown) {
  const existingId = getTodoId(data);
  if (existingId) {
    const existingTodo = await TodoModel.findOne({ id: existingId });
    if (existingTodo) {
      return { id: existingTodo.id };
    }
  }

  const todo = new TodoModel(data);
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

export async function completeTodo(id: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id });
  if (!todo || todo.status !== "pending") {
    throw new AppError(404, "Todo hittades inte eller är inte pending");
  }
  todo.status = "done";
  todo.completedAt = new Date().toISOString();
  await todo.save();
  broadcastTodosChanged();
}

export async function updateTodo(id: string, patch: unknown) {
  const todo = await TodoModel.findOne({ id });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }

  Object.assign(todo, patch);
  await todo.save();
  broadcastTodosChanged();
  return { ok: true };
}

export async function approveTodo(id: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  todo.status = "approved";
  todo.approvedBy = memberId;
  todo.approvedAt = new Date().toISOString();
  await todo.save();
  broadcastTodosChanged();
}

export async function rejectTodo(id: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  if (canRetryRejectedTodo({ expiresAt: todo.expiresAt })) {
    todo.status = "pending";
    todo.completedAt = null;
    todo.approvedBy = null;
    todo.approvedAt = null;
    todo.rejectedBy = null;
    todo.rejectedAt = null;
    await todo.save();
    broadcastTodosChanged();
    return;
  }

  todo.status = "rejected";
  todo.rejectedBy = memberId;
  todo.rejectedAt = new Date().toISOString();
  await todo.save();
  broadcastTodosChanged();
}

function canRetryRejectedTodo(todo: { expiresAt: string | null }, now = Date.now()) {
  if (!todo.expiresAt) {
    return true;
  }

  return new Date(todo.expiresAt).getTime() > now;
}

export async function deleteTodo(id: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  todo.deletedAt = new Date().toISOString();
  todo.deletedBy = memberId;
  await todo.save();
  broadcastTodosChanged();
}

export async function restoreTodo(id: string) {
  const todo = await TodoModel.findOne({ id });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  todo.deletedAt = null;
  todo.deletedBy = null;
  await todo.save();
  broadcastTodosChanged();
}
