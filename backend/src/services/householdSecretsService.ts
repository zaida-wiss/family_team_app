import crypto from "crypto";
import { HouseholdSecretModel } from "../db/models/HouseholdSecret.js";
import { AppError } from "../utils/errors.js";
import { requireAdultMember } from "./todoCategoriesService.js";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../utils/fieldEncryption.js";
import type { HouseholdSecretKind } from "../../../shared/types.js";

// Hushållets lösenord + abonnemang (2026-07-25, Zaidas önskemål) — ENDAST
// vuxna, både läsning och skrivning (till skillnad från Recept, som hela
// familjen ser) — genuint känsligt: wifi-lösenord, försäkringsinloggningar,
// bankinfo. Se HouseholdSecret i shared/types.ts för krypteringsmodellens
// dokumentation (server-hållen nyckel, inte klientsidig/nolltillit).

type SecretInput = {
  kind: HouseholdSecretKind;
  title: string;
  username: string | null;
  secret: string;
  notes: string | null;
  cost: number | null;
  renewalDate: string | null;
};

function normalizeInput(body: unknown): SecretInput {
  const b = body as Partial<SecretInput> & { secret?: unknown };
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) throw new AppError(400, "Namn kan inte vara tomt");
  const kind = b.kind === "subscription" ? "subscription" : "password";
  const secret = typeof b.secret === "string" ? b.secret : "";
  if (!secret.trim()) throw new AppError(400, "Lösenord/uppgift kan inte vara tomt");
  return {
    kind,
    title,
    username: typeof b.username === "string" && b.username.trim() ? b.username.trim() : null,
    secret,
    notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim() : null,
    cost: typeof b.cost === "number" ? b.cost : null,
    renewalDate: typeof b.renewalDate === "string" && b.renewalDate ? b.renewalDate : null
  };
}

function decryptEntry(accountId: string, entry: { toObject: () => Record<string, unknown> }) {
  const plain = entry.toObject();
  return {
    ...plain,
    username: decryptNullable(accountId, plain.username as string | null),
    secret: decryptField(accountId, plain.secretEnc as string),
    notes: decryptNullable(accountId, plain.notes as string | null)
  };
}

export async function getAllSecrets(accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  const entries = await HouseholdSecretModel.find({ accountId, deletedAt: null }).sort({ title: 1 });
  return entries.map((entry) => decryptEntry(accountId, entry));
}

export async function createSecret(accountId: string, memberId: string | null, body: unknown) {
  const member = await requireAdultMember(memberId, accountId);
  const input = normalizeInput(body);
  const entry = await HouseholdSecretModel.create({
    id: `household-secret-${crypto.randomUUID()}`,
    accountId,
    kind: input.kind,
    title: input.title,
    username: encryptNullable(accountId, input.username) ?? null,
    secretEnc: encryptField(accountId, input.secret),
    notes: encryptNullable(accountId, input.notes) ?? null,
    cost: input.cost,
    renewalDate: input.renewalDate,
    createdBy: member.id,
    deletedAt: null,
    deletedBy: null
  });
  return decryptEntry(accountId, entry);
}

async function findSecretInAccount(id: string, accountId: string) {
  const entry = await HouseholdSecretModel.findOne({ id, accountId, deletedAt: null });
  if (!entry) {
    throw new AppError(404, "Hittades inte");
  }
  return entry;
}

export async function updateSecret(id: string, accountId: string, memberId: string | null, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const input = normalizeInput(body);
  const entry = await findSecretInAccount(id, accountId);
  entry.kind = input.kind;
  entry.title = input.title;
  entry.username = encryptNullable(accountId, input.username) ?? null;
  entry.secretEnc = encryptField(accountId, input.secret);
  entry.notes = encryptNullable(accountId, input.notes) ?? null;
  entry.cost = input.cost;
  entry.renewalDate = input.renewalDate;
  await entry.save();
  return { ok: true };
}

export async function deleteSecret(id: string, accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  const entry = await findSecretInAccount(id, accountId);
  entry.deletedAt = new Date().toISOString();
  entry.deletedBy = memberId;
  await entry.save();
  return { ok: true };
}
