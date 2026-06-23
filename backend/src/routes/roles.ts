import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as roles from "../services/rolesService.js";

export const rolesRouter = Router();

rolesRouter.get("/", async (_req, res) => {
  res.json(await roles.getAllRoles());
});

rolesRouter.post("/", requireAuth, async (req, res) => {
  res.status(201).json(await roles.createRole(req.body));
});

rolesRouter.patch("/:id/permissions", requireAuth, async (req, res) => {
  await roles.updatePermissions(req.params.id, req.body);
  res.json({ ok: true });
});
