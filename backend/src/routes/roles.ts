import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as roles from "../services/rolesService.js";
import { accountIdOf } from "../utils/memberUtils.js";

export const rolesRouter = Router();

rolesRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await roles.getAllRoles(accountId));
});

rolesRouter.post("/", requireAuth, async (req, res) => {
  res.status(201).json(await roles.createRole(req.body));
});

rolesRouter.patch("/:id/permissions", requireAuth, async (req, res) => {
  await roles.updatePermissions(req.params.id, req.body);
  res.json({ ok: true });
});
