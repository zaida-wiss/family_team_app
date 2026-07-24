import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as recipes from "../services/recipesService.js";

export const recipesRouter = Router();
recipesRouter.use(requireAuth, attachAccountId);

recipesRouter.get("/", async (req, res) => {
  res.json(await recipes.getAllRecipes(req.accountId!));
});

recipesRouter.post("/", async (req, res) => {
  res.status(201).json(await recipes.createRecipe(req.accountId!, req.memberId ?? null, req.body));
});

recipesRouter.patch("/:id", async (req, res) => {
  res.json(await recipes.updateRecipe(req.params.id, req.accountId!, req.memberId ?? null, req.body));
});

recipesRouter.delete("/:id", async (req, res) => {
  res.json(await recipes.deleteRecipe(req.params.id, req.accountId!, req.memberId ?? null));
});
