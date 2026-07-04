import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as roles from "../services/rolesService.js";
import { MemberModel } from "../db/models/Member.js";
import { AppError } from "../utils/errors.js";
import { hasPermission } from "../../../shared/permissions.js";

export const rolesRouter = Router();
rolesRouter.use(requireAuth, attachAccountId);

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

rolesRouter.get("/", async (req, res) => {
  res.json(await roles.getAllRoles(req.accountId!));
});

rolesRouter.post("/", async (req, res) => {
  await requireCanManageRoles(req.memberId, req.accountId!);
  res.status(201).json(await roles.createRole(req.accountId!, req.body));
});

rolesRouter.patch("/:id/permissions", async (req, res) => {
  await requireCanManageRoles(req.memberId, req.accountId!);
  await roles.updatePermissions(req.params.id, req.accountId!, req.body, req.memberId ?? null);
  res.json({ ok: true });
});
