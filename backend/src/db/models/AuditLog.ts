import { Schema, model } from "mongoose";
import type { AuditLogEntry } from "../../../../shared/types.js";

const schema = new Schema<AuditLogEntry>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  action: { type: String, required: true },
  actorMemberId: { type: String, default: null },
  summary: { type: String, required: true },
  createdAt: { type: String, required: true },
});

schema.index({ accountId: 1, createdAt: -1 });

export const AuditLogModel = model<AuditLogEntry>("AuditLog", schema);
