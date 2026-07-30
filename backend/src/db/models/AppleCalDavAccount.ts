import { Schema, model } from "mongoose";
import type { AppleCalDavAccount } from "../../../../shared/types.js";

// Apple-inloggning på KONTONIVÅ (2026-07-30, ADR-0027-tillägg) — en
// fristående, kontobred collection istället för inbäddad i Calendar, så
// flera BMAD-kalendrar kan dela SAMMA inloggade Apple-konto utan att man
// skriver in e-post/lösenord flera gånger.
const appleCalDavAccountSchema = new Schema<AppleCalDavAccount>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  accountEmailEnc: { type: String, required: true },
  appSpecificPasswordEnc: { type: String, required: true },
  createdBy: { type: String, required: true },
  connectedAt: { type: String, required: true }
});

appleCalDavAccountSchema.index({ accountId: 1 });

export const AppleCalDavAccountModel = model<AppleCalDavAccount>("AppleCalDavAccount", appleCalDavAccountSchema);
