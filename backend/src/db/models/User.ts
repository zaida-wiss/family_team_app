import { Schema, model } from "mongoose";
import { z } from "zod";
import type { User } from "../../../../shared/types.js";

type UserDoc = User & {
  passwordHash: string;
  tokenVersion: number;
  passwordResetTokenHash: string | null;
  passwordResetExpiry: string | null;
};

// Barn-inloggning (2026-07-22, Zaidas önskemål: "vi använder mitt adminkonto
// även på barnens telefoner") — ett barn får ett eget User-dokument precis
// som en vuxen (samma JWT/refresh/fetchMemberships-infrastruktur återanvänds
// helt oförändrad), men utan e-post: email är nu VALFRI, och username är
// NYTT. username är medvetet INTE globalt unikt i databasen — bara unikt
// INOM familjen (kontrolleras i membersService.ts:s setChildCredentials) —
// inloggning som barn sker därför via förälderns e-post + username +
// lösenord (authService.ts:s childLogin), inte username ensamt.
const userSchema = new Schema<UserDoc>({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: false, default: null, lowercase: true, trim: true },
  username: { type: String, required: false, default: null, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: String, required: true },
  lastActiveMemberId: { type: String, default: null },
  tokenVersion: { type: Number, default: 0 },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiry: { type: String, default: null }
});

// Ett vanligt sparse unique-index (unique:true, sparse:true på fältet) räcker
// INTE här — sparse hoppar bara över dokument där fältet helt SAKNAS, inte
// dokument där det uttryckligen är null. Barn skapas alltid med email:null
// explicit (se membersService.ts:s setChildCredentials), så två barn hade
// annars krockat på samma "null"-värde i ett sparse-index. Ett partiellt
// index som bara omfattar STRÄNG-värden löser det korrekt.
//
// EXPLICIT NAMN (email_partial_unique) — produktionsdatabasen har redan ett
// äldre index på email (från när fältet var required+unique, utan partial-
// filter) som skulle råka få SAMMA namn (email_1) om detta lämnades
// namnlöst, vilket hade fått Mongooses autoIndex att kollidera med ett
// redan existerande index med andra villkor vid nästa serverstart — i värsta
// fall en krasch vid uppstart. Explicit namn undviker kollisionen helt.
// backend/scripts/migrateUserEmailIndex.ts droppar det gamla indexet
// (krävs för att ett ANDRA barn i produktion ska kunna få en egen
// inloggning — innan dess blockerar det gamla indexet fortfarande flera
// email:null-dokument).
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } }, name: "email_partial_unique" }
);

export const UserModel = model<UserDoc>("User", userSchema);

export const registerSchema = z.object({
  email: z.string().email("Ogiltig e-postadress"),
  password: z.string().min(8, "Lösenordet måste vara minst 8 tecken"),
  name: z.string().min(1, "Namn krävs").max(60)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// Barnets lösenord sätts alltid av en förälder (aldrig självregistrering),
// därför ett kortare minimikrav än vuxnas (PIN-liknande, lättare för ett
// barn att komma ihåg/skriva på en telefon) — samma mycket strikta
// authLimiter (10 försök/15 min) som skyddar /login gäller även /child-login.
export const childLoginSchema = z.object({
  parentEmail: z.string().email("Ogiltig e-postadress"),
  username: z.string().min(1, "Användarnamn krävs").max(30),
  password: z.string().min(1)
});

export const setChildCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, "Minst 2 tecken")
    .max(30)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Bara bokstäver, siffror, punkt, bindestreck och understreck"),
  password: z.string().min(4, "Minst 4 tecken")
});
