import { Schema, model } from "mongoose";
import type { Account } from "../../../../shared/types.js";

const accountSchema = new Schema<Account>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ["family"], required: true },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null }
});

export const AccountModel = model<Account>("Account", accountSchema);
