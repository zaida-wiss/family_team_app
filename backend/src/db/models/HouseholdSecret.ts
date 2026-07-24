import { Schema, model } from "mongoose";
import type { HouseholdSecret } from "../../../../shared/types.js";

// Hushållets lösenord + abonnemang (2026-07-25) — se HouseholdSecret i
// shared/types.ts för krypteringsmodellens dokumentation. username/
// secretEnc/notes lagras krypterade (fieldEncryption.ts), aldrig i
// GDPR-exporten.
const householdSecretSchema = new Schema<HouseholdSecret>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  kind: { type: String, required: true },
  title: { type: String, required: true },
  username: { type: String, default: null },
  secretEnc: { type: String, required: true },
  notes: { type: String, default: null },
  cost: { type: Number, default: null },
  renewalDate: { type: String, default: null },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

householdSecretSchema.index({ accountId: 1, kind: 1 });

export const HouseholdSecretModel = model<HouseholdSecret>("HouseholdSecret", householdSecretSchema);
