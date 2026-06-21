import { Schema, model } from "mongoose";
import type { Account } from "../../../../shared/types.js";

const accountSchema = new Schema<Account>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ["family", "workplace"], required: true },
  createdBy: { type: String, required: true }
});

export const AccountModel = model<Account>("Account", accountSchema);
