import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import { addTodoEventsClient } from "../realtime/todoEvents.js";
import * as todos from "../services/todosService.js";
import {
  CompleteTodoBodySchema,
  CreateFamilyWideItemBodySchema,
  RejectTodoBodySchema,
  TodosHistoryQuerySchema,
  ToggleInProgressBodySchema
} from "../../../shared/schemas.js";

export const todosRouter = Router();

todosRouter.get("/", requireAuth, attachAccountId, async (req, res) => {
  res.json(await todos.getAllTodos(req.accountId!));
});

const MAX_HISTORY_PAGE_SIZE = 100;
const DEFAULT_HISTORY_PAGE_SIZE = 25;

// Historik/papperskorg, paginerad (2026-07-26) — se todosService.ts:s
// getTodosHistoryPage för vad som räknas hit och varför.
todosRouter.get("/history", requireAuth, attachAccountId, async (req, res) => {
  const { page, pageSize } = TodosHistoryQuerySchema.parse(req.query);
  const cappedPageSize = Math.min(pageSize ?? DEFAULT_HISTORY_PAGE_SIZE, MAX_HISTORY_PAGE_SIZE);
  res.json(await todos.getTodosHistoryPage(req.accountId!, page ?? 1, cappedPageSize));
});

todosRouter.post("/", requireAuth, attachAccountId, async (req, res) => {
  res.status(201).json(await todos.createTodo({ ...req.body, accountId: req.accountId! }));
});

// Dela ALLT kopplat till barnets konto, inte bara todos, med en annan vuxen,
// icke-transitivt (ADR-0024, utökad 2026-07-27) — rör INTE den vanliga
// kontoscopade GET / ovan alls, en helt separat, additiv väg. Måste
// registreras FÖRE PATCH-rutterna med /:id nedan av samma skäl som /events
// (annars matchar Express literalt fel segment).
todosRouter.get("/shared-children", requireAuth, attachAccountId, async (req, res) => {
  res.json(await todos.getSharedChildrenData(req.memberId!, req.accountId!));
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

// Godkänn/neka på ett delat barns todos (2026-07-29, ADR-0024-uppföljning,
// Zaidas beslut: "full åtkomst, som en riktig förälder") — kräver "edit"-
// åtkomst, samma spärr som complete ovan.
todosRouter.patch(
  "/shared/:childAccountId/:childMemberId/:id/approve",
  requireAuth,
  attachAccountId,
  async (req, res) => {
    await todos.approveSharedChildTodo(
      req.params.id,
      req.params.childAccountId,
      req.params.childMemberId,
      req.memberId!,
      req.accountId!
    );
    res.json({ ok: true });
  }
);

todosRouter.patch(
  "/shared/:childAccountId/:childMemberId/:id/reject",
  requireAuth,
  attachAccountId,
  async (req, res) => {
    const { reason } = RejectTodoBodySchema.parse(req.body ?? {});
    await todos.rejectSharedChildTodo(
      req.params.id,
      req.params.childAccountId,
      req.params.childMemberId,
      req.memberId!,
      req.accountId!,
      reason ?? null
    );
    res.json({ ok: true });
  }
);

// Mina familjekonton (2026-07-25) — mina EGNA andra medlemskap, inte en
// delnings-grant. Måste registreras FÖRE PATCH-rutterna med /:id nedan.
todosRouter.get("/family-across-accounts", requireAuth, attachAccountId, async (req, res) => {
  res.json(await todos.getCrossAccountFamilyTodos(req.userId!, req.accountId!, req.memberId!));
});

todosRouter.patch(
  "/family-across-accounts/:targetAccountId/:id/complete",
  requireAuth,
  async (req, res) => {
    const { elapsedMs } = CompleteTodoBodySchema.parse(req.body ?? {});
    await todos.completeCrossAccountFamilyTodo(req.userId!, req.params.targetAccountId, req.params.id, elapsedMs ?? null);
    res.json({ ok: true });
  }
);

// Lägg till en ny Familjen-uppgift direkt i ETT AV MINA ANDRA konton
// (2026-08-01, Zaidas önskemål: "kunna lägga till nya todos som är
// förinställda på den aktuella familjen").
todosRouter.post("/family-across-accounts/:targetAccountId", requireAuth, async (req, res) => {
  const { title, visual } = CreateFamilyWideItemBodySchema.parse(req.body);
  res.status(201).json(await todos.createCrossAccountFamilyTodo(req.userId!, req.params.targetAccountId, title, visual ?? null));
});

// Signa upp sig / lämna en Familjen-uppgift i ETT AV MINA ANDRA konton
// (2026-08-01) — samma "vem håller på med den här"-dubbeltryck-mekanik som
// redan finns lokalt, se todosService.ts.
todosRouter.patch("/family-across-accounts/:targetAccountId/:id/in-progress", requireAuth, async (req, res) => {
  const { targetMemberId } = ToggleInProgressBodySchema.parse(req.body ?? {});
  const result = await todos.toggleInProgressCrossAccountFamilyTodo(
    req.userId!,
    req.params.targetAccountId,
    req.params.id,
    targetMemberId
  );
  res.json(result);
});

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar", inte kontoåtkomst) — måste registreras FÖRE
// PATCH-rutterna med /:id nedan, av samma skäl som /shared-children och
// /family-across-accounts ovan.
todosRouter.get("/connections", requireAuth, attachAccountId, async (req, res) => {
  res.json(await todos.getConnectionTodos(req.accountId!, req.memberId ?? null));
});

// Lägg till en ny Familjen-uppgift i en ANSLUTEN familjs konto (2026-08-01,
// kräver redigera-åtkomst i anslutningen, samma spärr som complete/approve/
// reject nedan).
todosRouter.post("/connections/:targetAccountId", requireAuth, attachAccountId, async (req, res) => {
  const { title, visual } = CreateFamilyWideItemBodySchema.parse(req.body);
  res
    .status(201)
    .json(await todos.createConnectionTodo(req.params.targetAccountId, req.accountId!, req.memberId!, title, visual ?? null));
});

todosRouter.patch(
  "/connections/:targetAccountId/:id/complete",
  requireAuth,
  attachAccountId,
  async (req, res) => {
    const { elapsedMs } = CompleteTodoBodySchema.parse(req.body ?? {});
    await todos.completeConnectionTodo(req.params.targetAccountId, req.params.id, req.accountId!, req.memberId!, elapsedMs ?? null);
    res.json({ ok: true });
  }
);

todosRouter.patch(
  "/connections/:targetAccountId/:id/approve",
  requireAuth,
  attachAccountId,
  async (req, res) => {
    await todos.approveConnectionTodo(req.params.targetAccountId, req.params.id, req.accountId!, req.memberId!);
    res.json({ ok: true });
  }
);

todosRouter.patch(
  "/connections/:targetAccountId/:id/reject",
  requireAuth,
  attachAccountId,
  async (req, res) => {
    const { reason } = RejectTodoBodySchema.parse(req.body ?? {});
    await todos.rejectConnectionTodo(req.params.targetAccountId, req.params.id, req.accountId!, req.memberId!, reason ?? null);
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

// ADR-0025 — permanent tömning av papperskorgen.
todosRouter.post("/purge-trash", requireAuth, attachAccountId, async (req, res) => {
  await todos.purgeTrash(req.accountId!, req.memberId ?? null);
  res.json({ ok: true });
});

todosRouter.patch("/:id/in-progress", requireAuth, attachAccountId, async (req, res) => {
  const { targetMemberId } = ToggleInProgressBodySchema.parse(req.body ?? {});
  const result = await todos.toggleInProgress(req.params.id, req.accountId!, req.memberId ?? null, targetMemberId);
  res.json(result);
});

// Massradering i "Mina uppgifter" (2026-08-03) — se todosService.ts:s unassignSelf.
todosRouter.patch("/:id/unassign-self", requireAuth, attachAccountId, async (req, res) => {
  const result = await todos.unassignSelf(req.params.id, req.accountId!, req.memberId ?? null);
  res.json(result);
});

todosRouter.patch("/:id/subtasks/:subtaskId", requireAuth, attachAccountId, async (req, res) => {
  const result = await todos.toggleSubtask(req.params.id, req.accountId!, req.params.subtaskId);
  res.json(result);
});
