import { TodoModel } from "../db/models/Todo.js";
import { AppError } from "../utils/errors.js";

export async function getAllTodos() {
  return TodoModel.find({}, { _id: 0, __v: 0 });
}

export async function createTodo(data: unknown) {
  const todo = new TodoModel(data);
  await todo.save();
  return { id: todo.id };
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
