import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as recipes from "../services/recipesService.js";
import * as familyConnections from "../services/familyConnectionsService.js";

export const recipesRouter = Router();
recipesRouter.use(requireAuth, attachAccountId);

recipesRouter.get("/", async (req, res) => {
  res.json(await recipes.getAllRecipes(req.accountId!));
});

// Familjeanslutningar (ADR-0030, 2026-07-29) — läsning av anslutna familjers
// receptbok. Måste registreras FÖRE PATCH/DELETE-rutterna med /:id nedan,
// annars matchar Express "connections" literalt som ett recept-id.
recipesRouter.get("/connections", async (req, res) => {
  res.json(await familyConnections.getConnectionRecipes(req.accountId!, req.memberId ?? null));
});

// Mina familjekonton (2026-08-01, Zaidas önskemål, se getCrossAccountRecipes)
// — mina EGNA riktiga medlemskap, används av måltidsplaneringen i Hem-vyn.
recipesRouter.get("/cross-account", async (req, res) => {
  res.json(await recipes.getCrossAccountRecipes(req.userId!, req.accountId!, req.memberId!));
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
