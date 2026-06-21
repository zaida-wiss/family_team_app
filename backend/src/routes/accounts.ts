import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { AccountModel } from "../db/models/Account.js";

export const accountsRouter = Router();

accountsRouter.get("/:id", async (request, response) => {
  const account = await AccountModel.findOne({ id: request.params.id }, { _id: 0, __v: 0 });
  if (!account) {
    response.status(404).json({ error: "Konto hittades inte" });
    return;
  }
  response.json(account);
});

accountsRouter.put("/:id", requireAuth, async (request, response) => {
  const account = await AccountModel.findOne({ id: request.params.id });
  if (!account) {
    response.status(404).json({ error: "Konto hittades inte" });
    return;
  }
  Object.assign(account, request.body);
  await account.save();
  response.json({ ok: true });
});
