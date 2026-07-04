import { RoleModel } from "../db/models/Role.js";
import { AppError } from "../utils/errors.js";
import { RoleSchema, PermissionsPatchSchema } from "../../../shared/schemas.js";
import { writeAuditLog } from "./auditLogService.js";

export async function getAllRoles(accountId: string) {
  return RoleModel.find({ accountId }, { _id: 0, __v: 0 });
}

export async function createRole(accountId: string, data: unknown) {
  const role = RoleSchema.parse(data);
  const created = new RoleModel({ ...role, accountId });
  await created.save();
  return { id: created.id };
}

export async function updatePermissions(id: string, accountId: string, patch: unknown, actorMemberId: string | null) {
  const permissions = PermissionsPatchSchema.parse(patch);
  const role = await RoleModel.findOne({ id, accountId });
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
