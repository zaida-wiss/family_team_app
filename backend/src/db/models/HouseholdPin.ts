import { Schema, model } from "mongoose";

// Extra lås för Hushåll-kategorin i Inställningar (2026-07-25, Zaidas
// önskemål: "en extra säkerhet när jag väljer hushåll... en 6 siffrig
// kod"). MEDVETET en egen, separat samling istället för ett fält på
// Account — Account-dokument returneras till klienten från ett dussintal
// olika ställen i backend (accountsService.ts/tokens.ts/invitationsService.ts
// m.fl.), och att lägga hashen där hade krävt att granska och exkludera den
// på VARJE av dem för att inte läcka en bcrypt-hash till frontend. En egen
// samling gör läckage strukturellt omöjligt istället för beroende av att
// komma ihåg en projektion överallt.
type HouseholdPinDoc = {
  accountId: string;
  pinHash: string;
};

const householdPinSchema = new Schema<HouseholdPinDoc>({
  accountId: { type: String, required: true, unique: true },
  pinHash: { type: String, required: true }
});

export const HouseholdPinModel = model<HouseholdPinDoc>("HouseholdPin", householdPinSchema);
