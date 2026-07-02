import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { addTodoEventsClient } from "../realtime/todoEvents.js";
import * as todos from "../services/todosService.js";
import { accountIdOf } from "../utils/memberUtils.js";
import { RejectTodoBodySchema } from "../../../shared/schemas.js";

export const todosRouter = Router();

todosRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await todos.getAllTodos(accountId));
});

todosRouter.post("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.status(201).json(await todos.createTodo({ ...req.body, accountId }));
});

todosRouter.get("/events", requireAuth, async (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  addTodoEventsClient(res);
});

todosRouter.patch("/:id", requireAuth, async (req, res) => {
  res.json(await todos.updateTodo(req.params.id, req.body));
});

todosRouter.patch("/:id/complete", requireAuth, async (req, res) => {
  await todos.completeTodo(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/approve", requireAuth, async (req, res) => {
  await todos.approveTodo(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/reject", requireAuth, async (req, res) => {
  const { reason } = RejectTodoBodySchema.parse(req.body ?? {});
  await todos.rejectTodo(req.params.id, req.memberId ?? null, reason ?? null);
  res.json({ ok: true });
});

todosRouter.delete("/:id", requireAuth, async (req, res) => {
  await todos.deleteTodo(req.params.id, req.memberId ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/restore", requireAuth, async (req, res) => {
  await todos.restoreTodo(req.params.id);
  res.json({ ok: true });
});
