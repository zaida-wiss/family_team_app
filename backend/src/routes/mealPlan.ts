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

// Mina familjekonton (2026-08-01, Zaidas önskemål: "man ska inte heller
// kunna planera måltider med andra familjer, utan då måste man först göra
// en familj med dessa familjer som medlemmar") — mina EGNA riktiga
// medlemskap, ALDRIG en Familjeanslutning. Måste registreras FÖRE /:id
// nedan.
mealPlanRouter.get("/cross-account", async (req, res) => {
  const { from, until } = req.query as { from?: string; until?: string };
  if (!from || !until) {
    res.status(400).json({ error: "from och until krävs" });
    return;
  }
  res.json(await mealPlan.getCrossAccountMealPlanEntries(req.userId!, req.accountId!, req.memberId!, from, until));
});

mealPlanRouter.post("/cross-account/:targetAccountId", async (req, res) => {
  res.status(201).json(await mealPlan.createCrossAccountEntry(req.userId!, req.params.targetAccountId, req.body));
});

mealPlanRouter.delete("/cross-account/:targetAccountId/:id", async (req, res) => {
  res.json(await mealPlan.removeCrossAccountEntry(req.userId!, req.params.targetAccountId, req.params.id));
});

mealPlanRouter.post("/", async (req, res) => {
  res.status(201).json(await mealPlan.createEntry(req.accountId!, req.memberId ?? null, req.body));
});

mealPlanRouter.delete("/:id", async (req, res) => {
  res.json(await mealPlan.removeEntry(req.params.id, req.accountId!, req.memberId ?? null));
});
