import { Schema, model } from "mongoose";
import type { Role } from "../../../../shared/types.js";

const roleSchema = new Schema<Role>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  isChildRole: { type: Boolean, default: false },
  permissions: { type: Schema.Types.Mixed, required: true }
});

export const RoleModel = model<Role>("Role", roleSchema);
