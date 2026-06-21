import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { RoleModel } from "../db/models/Role.js";

export const rolesRouter = Router();

rolesRouter.get("/", async (_request, response) => {
  const roles = await RoleModel.find({}, { _id: 0, __v: 0 });
  response.json(roles);
});

rolesRouter.post("/", requireAuth, async (request, response) => {
  const role = new RoleModel(request.body);
  await role.save();
  response.status(201).json({ id: role.id });
});

rolesRouter.patch("/:id/permissions", requireAuth, async (request, response) => {
  const role = await RoleModel.findOne({ id: request.params.id });
  if (!role) {
    response.status(404).json({ error: "Roll hittades inte" });
    return;
  }
  role.permissions = { ...role.permissions, ...request.body };
  role.markModified("permissions");
  await role.save();
  response.json({ ok: true });
});
