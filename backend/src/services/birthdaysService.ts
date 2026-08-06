import crypto from "crypto";
import { BirthdayModel } from "../db/models/Birthday.js";
import { AppError } from "../utils/errors.js";
import { requireAdultMember } from "./todoCategoriesService.js";

// Födelsedagslista (2026-08-06, Zaidas önskemål: "en lista över
// födelsedagar i inställningar där jag kan skriva in olika personer och
// när de är födda") — samma kontobredda/vuxen-bara mönster som
// HouseholdSecret (requireAdultMember gäller läsning OCH skrivning, till
// skillnad från t.ex. Recept som hela familjen ser) — sorteringen till
// "vem fyller år näst" görs klientsidan (frontend/src/features/settings/
// birthdayOrder.ts), samma princip som redan gäller för Todo-mallars
// återkommelse-beskrivning.

type BirthdayInput = {
  name: string;
  month: number;
  day: number;
  year: number | null;
};

function normalizeInput(body: unknown): BirthdayInput {
  const b = body as Partial<BirthdayInput>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw new AppError(400, "Namn kan inte vara tomt");
  const month = Math.trunc(Number(b.month));
  const day = Math.trunc(Number(b.day));
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new AppError(400, "Ogiltig månad");
  }
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    throw new AppError(400, "Ogiltig dag");
  }
  const year = typeof b.year === "number" && Number.isFinite(b.year) ? Math.trunc(b.year) : null;
  return { name, month, day, year };
}

// Utan behörighetskontroll (2026-08-06) — återanvänd av familyConnectionsService.ts:s
// getConnectionBirthdays, där anroparen inte har någon egen medlemsidentitet
// i KÄLLKONTOT (samma "kontrollen sker hos anroparen"-mönster som
// getAllRecipes/getAllLists redan följer för Familjeanslutningar).
export async function getAllBirthdaysRaw(accountId: string) {
  return BirthdayModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).sort({ name: 1 });
}

export async function getAllBirthdays(accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  return getAllBirthdaysRaw(accountId);
}

export async function createBirthday(accountId: string, memberId: string | null, body: unknown) {
  const member = await requireAdultMember(memberId, accountId);
  const input = normalizeInput(body);
  const entry = await BirthdayModel.create({
    id: `birthday-${crypto.randomUUID()}`,
    accountId,
    name: input.name,
    month: input.month,
    day: input.day,
    year: input.year,
    createdBy: member.id,
    deletedAt: null,
    deletedBy: null
  });
  return entry.toObject();
}

async function findBirthdayInAccount(id: string, accountId: string) {
  const entry = await BirthdayModel.findOne({ id, accountId, deletedAt: null });
  if (!entry) {
    throw new AppError(404, "Hittades inte");
  }
  return entry;
}

export async function updateBirthday(id: string, accountId: string, memberId: string | null, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const input = normalizeInput(body);
  const entry = await findBirthdayInAccount(id, accountId);
  entry.name = input.name;
  entry.month = input.month;
  entry.day = input.day;
  entry.year = input.year;
  await entry.save();
  return { ok: true };
}

export async function deleteBirthday(id: string, accountId: string, memberId: string | null) {
  await requireAdultMember(memberId, accountId);
  const entry = await findBirthdayInAccount(id, accountId);
  entry.deletedAt = new Date().toISOString();
  entry.deletedBy = memberId;
  await entry.save();
  return { ok: true };
}
