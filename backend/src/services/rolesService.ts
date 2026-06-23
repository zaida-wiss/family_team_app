import { RoleModel } from "../db/models/Role.js";
import { AppError } from "../utils/errors.js";

export async function getAllRoles() {
  return RoleModel.find({}, { _id: 0, __v: 0 });
}

export async function createRole(data: unknown) {
  const role = new RoleModel(data);
  await role.save();
  return { id: role.id };
}

export async function updatePermissions(id: string, permissions: unknown) {
  const role = await RoleModel.findOne({ id });
  if (!role) {
    throw new AppError(404, "Roll hittades inte");
  }
  role.permissions = { ...role.permissions, ...(permissions as object) };
  role.markModified("permissions");
  await role.save();
}
