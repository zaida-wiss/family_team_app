import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as auditLog from "../services/auditLogService.js";
import { AuditLogQuerySchema } from "../../../shared/schemas.js";
import { MemberModel } from "../db/models/Member.js";
import { RoleModel } from "../db/models/Role.js";
import { AppError } from "../utils/errors.js";
import { hasPermission } from "../../../shared/permissions.js";

export const auditLogRouter = Router();
auditLogRouter.use(requireAuth, attachAccountId);

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

// Audit-loggen är kontoomfattande, känsligare än en enskild resurs — samma
// behörighet som medlemshantering (canManageMembers) återanvänds istället för
// att införa en ny, smalare behörighetsnyckel för en enda vy.
async function requireCanManageMembers(memberId: string | undefined, accountId: string) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) throw new AppError(403, "Åtkomst nekad");
  const roles = await RoleModel.find({ id: member.roleId });
  if (!hasPermission(member, roles, "canManageMembers")) {
    throw new AppError(403, "Åtkomst nekad");
  }
}

auditLogRouter.get("/", async (req, res) => {
  await requireCanManageMembers(req.memberId, req.accountId!);
  const { page, pageSize } = AuditLogQuerySchema.parse(req.query);
  const cappedPageSize = Math.min(pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  res.json(await auditLog.getAuditLog(req.accountId!, page ?? 1, cappedPageSize));
});
