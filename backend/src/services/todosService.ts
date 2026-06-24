import { TodoModel } from "../db/models/Todo.js";
import { AppError } from "../utils/errors.js";
import type { Todo } from "../../../shared/types.js";

export async function getAllTodos() {
  return TodoModel.find({}, { _id: 0, __v: 0 });
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
}

export async function updateTodo(id: string, patch: unknown) {
  const todo = await TodoModel.findOne({ id });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }

  Object.assign(todo, patch);
  await todo.save();
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
}

export async function rejectTodo(id: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id });
  if (!todo || todo.status !== "done") {
    throw new AppError(404, "Todo hittades inte eller är inte done");
  }
  todo.status = "rejected";
  todo.rejectedBy = memberId;
  todo.rejectedAt = new Date().toISOString();
  await todo.save();
}

export async function deleteTodo(id: string, memberId: string | null) {
  const todo = await TodoModel.findOne({ id });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  todo.deletedAt = new Date().toISOString();
  todo.deletedBy = memberId;
  await todo.save();
}

export async function restoreTodo(id: string) {
  const todo = await TodoModel.findOne({ id });
  if (!todo) {
    throw new AppError(404, "Todo hittades inte");
  }
  todo.deletedAt = null;
  todo.deletedBy = null;
  await todo.save();
}
