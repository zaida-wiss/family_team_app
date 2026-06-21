import { Schema, model } from "mongoose";
import type { Member } from "../../../../shared/types.js";

const memberSchema = new Schema<Member>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  name: { type: String, required: true },
  roleId: { type: String, required: true },
  isChild: { type: Boolean, required: true },
  avatarUrl: { type: String, default: null },
  dashboardTheme: { type: String, default: null },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

export const MemberModel = model<Member>("Member", memberSchema);
