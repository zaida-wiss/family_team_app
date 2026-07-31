import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as mealPlan from "../services/mealPlanService.js";

export const mealPlanRouter = Router();
mealPlanRouter.use(requireAuth, attachAccountId);

mealPlanRouter.get("/", async (req, res) => {
  const { from, until } = req.query as { from?: string; until?: string };
  if (!from || !until) {
    res.status(400).json({ error: "from och until krävs" });
    return;
  }
  res.json(await mealPlan.getEntriesForRange(req.accountId!, from, until));
});

mealPlanRouter.post("/", async (req, res) => {
  res.status(201).json(await mealPlan.createEntry(req.accountId!, req.memberId ?? null, req.body));
});

mealPlanRouter.delete("/:id", async (req, res) => {
  res.json(await mealPlan.removeEntry(req.params.id, req.accountId!, req.memberId ?? null));
});
