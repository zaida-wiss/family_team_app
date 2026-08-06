import { Schema, model } from "mongoose";
import type { Birthday } from "../../../../shared/types.js";

// Födelsedagslista (2026-08-06) — se Birthday i shared/types.ts.
const birthdaySchema = new Schema<Birthday>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  name: { type: String, required: true },
  month: { type: Number, required: true },
  day: { type: Number, required: true },
  year: { type: Number, default: null },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

birthdaySchema.index({ accountId: 1 });

export const BirthdayModel = model<Birthday>("Birthday", birthdaySchema);
