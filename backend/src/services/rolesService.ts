import { RoleModel } from "../db/models/Role.js";
import { MemberModel } from "../db/models/Member.js";
import { AppError } from "../utils/errors.js";
import { RoleSchema, PermissionsPatchSchema } from "../../../shared/schemas.js";
import { writeAuditLog } from "./auditLogService.js";

export async function getAllRoles(accountId: string) {
  const members = await MemberModel.find({ accountId, deletedAt: null }, { roleId: 1, _id: 0 });
  const roleIds = [...new Set(members.map((m) => m.roleId).filter(Boolean))];
  if (roleIds.length === 0) return [];
  return RoleModel.find({ id: { $in: roleIds } }, { _id: 0, __v: 0 });
}

// Roll-modellen har inget accountId-fält (roller är inte konto-scopade i schemat), så
// "tillhör kontot" kan bara verifieras genom att en medlem i kontot faktiskt använder
// rollen — samma mönster som getAllRoles.
async function assertRoleInAccount(roleId: string, accountId: string) {
  const inUse = await MemberModel.exists({ accountId, roleId, deletedAt: null });
  if (!inUse) throw new AppError(403, "Åtkomst nekad");
}

export async function createRole(data: unknown) {
  const role = RoleSchema.parse(data);
  const created = new RoleModel(role);
  await created.save();
  return { id: created.id };
}

export async function updatePermissions(id: string, accountId: string, patch: unknown, actorMemberId: string | null) {
  await assertRoleInAccount(id, accountId);
  const permissions = PermissionsPatchSchema.parse(patch);
  const role = await RoleModel.findOne({ id });
  if (!role) {
    throw new AppError(404, "Roll hittades inte");
  }
  role.permissions = { ...role.permissions, ...permissions };
  role.markModified("permissions");
  await role.save();
  await writeAuditLog(
    accountId,
    "role_permissions_changed",
    actorMemberId,
    `Ändrade behörigheter för rollen "${role.name}" (${Object.keys(permissions).join(", ")})`
  );
}
