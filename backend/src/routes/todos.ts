import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { TodoModel } from "../db/models/Todo.js";

export const todosRouter = Router();

todosRouter.get("/", async (_request, response) => {
  const todos = await TodoModel.find({}, { _id: 0, __v: 0 });
  response.json(todos);
});

todosRouter.post("/", requireAuth, async (request, response) => {
  const todo = new TodoModel(request.body);
  await todo.save();
  response.status(201).json({ id: todo.id });
});

todosRouter.patch("/:id/complete", requireAuth, async (request, response) => {
  const todo = await TodoModel.findOne({ id: request.params.id });
  if (!todo || todo.status !== "pending") {
    response.status(404).json({ error: "Todo hittades inte eller är inte pending" });
    return;
  }
  todo.status = "done";
  todo.completedAt = new Date().toISOString();
  await todo.save();
  response.json({ ok: true });
});

todosRouter.patch("/:id/approve", requireAuth, async (request, response) => {
  const todo = await TodoModel.findOne({ id: request.params.id });
  if (!todo || todo.status !== "done") {
    response.status(404).json({ error: "Todo hittades inte eller är inte done" });
    return;
  }
  todo.status = "approved";
  todo.approvedBy = request.memberId ?? null;
  todo.approvedAt = new Date().toISOString();
  await todo.save();
  response.json({ ok: true });
});

todosRouter.patch("/:id/reject", requireAuth, async (request, response) => {
  const todo = await TodoModel.findOne({ id: request.params.id });
  if (!todo || todo.status !== "done") {
    response.status(404).json({ error: "Todo hittades inte eller är inte done" });
    return;
  }
  todo.status = "rejected";
  todo.rejectedBy = request.memberId ?? null;
  todo.rejectedAt = new Date().toISOString();
  await todo.save();
  response.json({ ok: true });
});

todosRouter.delete("/:id", requireAuth, async (request, response) => {
  const todo = await TodoModel.findOne({ id: request.params.id });
  if (!todo) {
    response.status(404).json({ error: "Todo hittades inte" });
    return;
  }
  todo.deletedAt = new Date().toISOString();
  todo.deletedBy = request.memberId ?? null;
  await todo.save();
  response.json({ ok: true });
});

todosRouter.patch("/:id/restore", requireAuth, async (request, response) => {
  const todo = await TodoModel.findOne({ id: request.params.id });
  if (!todo) {
    response.status(404).json({ error: "Todo hittades inte" });
    return;
  }
  todo.deletedAt = null;
  todo.deletedBy = null;
  await todo.save();
  response.json({ ok: true });
});
