import bcrypt from "bcryptjs";
import { HouseholdPinModel } from "../db/models/HouseholdPin.js";
import { AppError } from "../utils/errors.js";
import { requireAdultMember } from "./todoCategoriesService.js";

// Extra lås för Hushåll-kategorin (2026-07-25, Zaidas önskemål) — en
// 6-siffrig kod, hashad (bcrypt, samma bibliotek som User.passwordHash),
// delad per KONTO (inte per medlem — vilken vuxen som helst i familjen ska
// kunna låsa upp med samma kod). Detta är en UX-nivå-privacy-skärm, INTE en
// ny kryptografisk gräns — den underliggande datan (HouseholdSecret) är
// redan skyddad av requireAdultMember oavsett, se householdSecretsService.ts.
// Syftet är att stoppa ett barn/en gäst som råkar plocka upp en redan
// inloggad vuxens telefon, inte att stå emot ett riktigt intrångsförsök.

const PIN_PATTERN = /^\d{6}$/;

function normalizePin(body: unknown): string {
  const pin = typeof (body as { pin?: unknown })?.pin === "string" ? (body as { pin: string }).pin : "";
  if (!PIN_PATTERN.test(pin)) {
    throw new AppError(400, "Koden måste vara exakt 6 siffror");
  }
  return pin;
}

export async function getHouseholdPinStatus(accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  const existing = await HouseholdPinModel.findOne({ accountId });
  return { isSet: !!existing };
}

export async function setHouseholdPin(accountId: string, memberId: string | null, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const pin = normalizePin(body);
  const pinHash = await bcrypt.hash(pin, 10);
  await HouseholdPinModel.updateOne({ accountId }, { $set: { pinHash } }, { upsert: true });
  return { ok: true };
}

export async function verifyHouseholdPin(accountId: string, memberId: string | null, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const pin = normalizePin(body);
  const existing = await HouseholdPinModel.findOne({ accountId });
  if (!existing) {
    // Ingen kod satt än — inget att låsa upp mot.
    return { ok: false };
  }
  const ok = await bcrypt.compare(pin, existing.pinHash);
  return { ok };
}
