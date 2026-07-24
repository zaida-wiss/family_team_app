import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as householdSecrets from "../services/householdSecretsService.js";

export const householdSecretsRouter = Router();
householdSecretsRouter.use(requireAuth, attachAccountId);

householdSecretsRouter.get("/", async (req, res) => {
  res.json(await householdSecrets.getAllSecrets(req.accountId!, req.memberId ?? null));
});

householdSecretsRouter.post("/", async (req, res) => {
  res.status(201).json(await householdSecrets.createSecret(req.accountId!, req.memberId ?? null, req.body));
});

householdSecretsRouter.patch("/:id", async (req, res) => {
  res.json(await householdSecrets.updateSecret(req.params.id, req.accountId!, req.memberId ?? null, req.body));
});

householdSecretsRouter.delete("/:id", async (req, res) => {
  res.json(await householdSecrets.deleteSecret(req.params.id, req.accountId!, req.memberId ?? null));
});
