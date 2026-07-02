import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as roles from "../services/rolesService.js";
import { accountIdOf } from "../utils/memberUtils.js";
import { MemberModel } from "../db/models/Member.js";
import { AppError } from "../utils/errors.js";
import { hasPermission } from "../../../shared/permissions.js";

export const rolesRouter = Router();

// Servern litade tidigare bara på att frontend gömde knappar bakom hasPermission — vem
// som helst med giltig JWT kunde anropa dessa endpoints direkt. hasPermission är samma
// rena funktion som redan används i frontend (nu i shared/permissions.ts), återanvänd
// server-side istället för att skriva en ny variant.
async function requireCanManageRoles(memberId: string | undefined, accountId: string) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) throw new AppError(403, "Åtkomst nekad");
  const allRoles = await roles.getAllRoles(accountId);
  if (!hasPermission(member, allRoles, "canManageRoles")) {
    throw new AppError(403, "Åtkomst nekad");
  }
}

rolesRouter.get("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  res.json(await roles.getAllRoles(accountId));
});

rolesRouter.post("/", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await requireCanManageRoles(req.memberId, accountId);
  res.status(201).json(await roles.createRole(req.body));
});

rolesRouter.patch("/:id/permissions", requireAuth, async (req, res) => {
  const accountId = await accountIdOf(req.memberId, req.userId);
  await requireCanManageRoles(req.memberId, accountId);
  await roles.updatePermissions(req.params.id, accountId, req.body);
  res.json({ ok: true });
});
