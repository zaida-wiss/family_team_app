import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import { addTodoEventsClient } from "../realtime/todoEvents.js";
import * as todos from "../services/todosService.js";
import { CompleteTodoBodySchema, RejectTodoBodySchema, ToggleInProgressBodySchema } from "../../../shared/schemas.js";

export const todosRouter = Router();

todosRouter.get("/", requireAuth, attachAccountId, async (req, res) => {
  res.json(await todos.getAllTodos(req.accountId!));
});

todosRouter.post("/", requireAuth, attachAccountId, async (req, res) => {
  res.status(201).json(await todos.createTodo({ ...req.body, accountId: req.accountId! }));
});

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024) — rör
// INTE den vanliga kontoscopade GET / ovan alls, en helt separat, additiv
// väg. Måste registreras FÖRE PATCH-rutterna med /:id nedan av samma skäl
// som /events (annars matchar Express literalt fel segment).
todosRouter.get("/shared-children", requireAuth, attachAccountId, async (req, res) => {
  res.json(await todos.getSharedChildrenTodos(req.memberId!, req.accountId!));
});

todosRouter.patch(
  "/shared/:childAccountId/:childMemberId/:id/complete",
  requireAuth,
  attachAccountId,
  async (req, res) => {
    const { elapsedMs } = CompleteTodoBodySchema.parse(req.body ?? {});
    await todos.completeSharedChildTodo(
      req.params.id,
      req.params.childAccountId,
      req.params.childMemberId,
      req.memberId!,
      req.accountId!,
      elapsedMs ?? null
    );
    res.json({ ok: true });
  }
);

todosRouter.get("/events", requireAuth, async (_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  addTodoEventsClient(res);
});

todosRouter.patch("/:id", requireAuth, attachAccountId, async (req, res) => {
  res.json(await todos.updateTodo(req.params.id, req.accountId!, req.body, req.memberId ?? null));
});

todosRouter.patch("/:id/complete", requireAuth, attachAccountId, async (req, res) => {
  const { elapsedMs } = CompleteTodoBodySchema.parse(req.body ?? {});
  await todos.completeTodo(req.params.id, req.accountId!, req.memberId ?? null, elapsedMs ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/approve", requireAuth, attachAccountId, async (req, res) => {
  await todos.approveTodo(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/reject", requireAuth, attachAccountId, async (req, res) => {
  const { reason } = RejectTodoBodySchema.parse(req.body ?? {});
  await todos.rejectTodo(req.params.id, req.accountId!, req.memberId ?? null, reason ?? null);
  res.json({ ok: true });
});

todosRouter.delete("/:id", requireAuth, attachAccountId, async (req, res) => {
  await todos.deleteTodo(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/restore", requireAuth, attachAccountId, async (req, res) => {
  await todos.restoreTodo(req.params.id, req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/in-progress", requireAuth, attachAccountId, async (req, res) => {
  const { targetMemberId } = ToggleInProgressBodySchema.parse(req.body ?? {});
  const result = await todos.toggleInProgress(req.params.id, req.accountId!, req.memberId ?? null, targetMemberId);
  res.json(result);
});

todosRouter.patch("/:id/subtasks/:subtaskId", requireAuth, attachAccountId, async (req, res) => {
  const result = await todos.toggleSubtask(req.params.id, req.accountId!, req.params.subtaskId);
  res.json(result);
});
