import { TodoCategoryModel } from "../db/models/TodoCategory.js";
import { MemberModel } from "../db/models/Member.js";
import { RoleModel } from "../db/models/Role.js";
import { TodoModel } from "../db/models/Todo.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "../utils/errors.js";

// Kontobreda (2026-07-07, Zaidas beslut) — tidigare strikt privata per medlem.
// Nu: alla VUXNA i kontot ser och kan redigera/döpa om/radera/gömma varandras
// kategorier (barnen har ingen egen åtkomst till dessa vyer överhuvudtaget, så
// bara vuxna behöver kunna hantera dem). `memberId` behålls på varje kategori
// som skapar-metadata (vem som gjorde den), inte längre som en åtkomstspärr.
export async function requireAdultMember(memberId: string | null | undefined, accountId: string) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const role = await RoleModel.findOne({ id: member.roleId });
  if (role?.isChildRole) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return member;
}

export async function getAllCategories(accountId: string) {
  return TodoCategoryModel.find(
    { accountId, deletedAt: null },
    { _id: 0, __v: 0 }
  ).sort({ createdAt: 1 });
}

export async function createCategory(accountId: string, memberId: string, name: string, isFamily = false) {
  await requireAdultMember(memberId, accountId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError(400, "Kategorinamn kan inte vara tomt");
  }
  const category = await TodoCategoryModel.create({
    id: `todo-category-${crypto.randomUUID()}`,
    accountId,
    memberId,
    name: trimmed,
    createdAt: new Date().toISOString(),
    isFamily,
    deletedAt: null,
    deletedBy: null
  });
  return category.toObject();
}

async function findCategoryInAccount(id: string, accountId: string) {
  const category = await TodoCategoryModel.findOne({ id, accountId, deletedAt: null });
  if (!category) {
    throw new AppError(404, "Kategori hittades inte");
  }
  return category;
}

export async function renameCategory(id: string, accountId: string, memberId: string, name: string) {
  await requireAdultMember(memberId, accountId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError(400, "Kategorinamn kan inte vara tomt");
  }
  const category = await findCategoryInAccount(id, accountId);
  category.name = trimmed;
  await category.save();
  return { ok: true };
}

// Gömd (2026-07-05) — skiljer sig från deleteCategory: kategorin syns inte i
// tråd-vyn men finns kvar oförändrad, kan visas igen via setCategoryHidden(false).
export async function setCategoryHidden(id: string, accountId: string, memberId: string, hidden: boolean) {
  await requireAdultMember(memberId, accountId);
  const category = await findCategoryInAccount(id, accountId);
  category.hidden = hidden;
  await category.save();
  return { ok: true };
}

// Auto-samlingskategori för familjevyn (2026-08-06, Zaidas önskemål: "i
// familjevyn skall den gå under familjens namn... om den kategorin inte
// finns skall den skapas igen när det finns okategoriserade uppgifter") —
// en RIKTIG, sparad TodoCategory (isFamily:true), inte bara ett tomt fält —
// går att byta namn på/gömma/radera som vilken annan kategori, men skapas
// automatiskt om den saknas när en familjekategori med kvarvarande
// uppgifter raderas. Namnges efter kontots namn (Inställningar → Konto).
async function getOrCreateUncategorizedCollector(accountId: string, memberId: string) {
  const existing = await TodoCategoryModel.findOne({
    accountId,
    isFamily: true,
    isUncategorizedCollector: true,
    deletedAt: null
  });
  if (existing) return existing;

  const account = await AccountModel.findOne({ id: accountId });
  const category = await TodoCategoryModel.create({
    id: `todo-category-${crypto.randomUUID()}`,
    accountId,
    memberId,
    name: account?.name ?? "Familjen",
    createdAt: new Date().toISOString(),
    isFamily: true,
    isUncategorizedCollector: true,
    deletedAt: null,
    deletedBy: null
  });
  return category;
}

// Zaidas önskemål 2026-08-06: "om en kategori raderas... alla som var i den
// kategorin nu få ett tomt fält i kategori-kolumnen, dessa okategoriserade
// uppgifter skall sedan samlas upp i en samlingskategori" — tidigare rörde
// deleteCategory bara kategorin själv, todos som pekade på den (via
// personalCategoryId) blev tysta, trasiga referenser (osynliga i tråd-vyn,
// utan varken varning eller väg tillbaka). En PERSONLIG kategoris uppgifter
// nollställs (samlas upp i ParentTodoThreadView.tsx:s virtuella, icke-
// döpbara "Mina uppgifter"-tråd — ingen riktig kategori krävs där, ingen
// UI låter användaren radera den, så "skapas igen"-scenariot kan aldrig
// inträffa för den). En FAMILJEKATEGORIS uppgifter flyttas istället till
// den riktiga samlingskategorin ovan (get-or-create) — men bara om det
// FAKTISKT fanns uppgifter kvar (annars inget att samla, ingen anledning
// att skapa en tom kategori) och bara om det INTE är samlingskategorin
// SJÄLV som raderas (då nollställs dess uppgifter istället — nästa
// familjekategori-radering med kvarvarande uppgifter skapar en ny åt dem).
export async function deleteCategory(id: string, accountId: string, memberId: string) {
  await requireAdultMember(memberId, accountId);
  const category = await findCategoryInAccount(id, accountId);
  category.deletedAt = new Date().toISOString();
  category.deletedBy = memberId;
  await category.save();

  const affectedCount = await TodoModel.countDocuments({ accountId, personalCategoryId: id, deletedAt: null });
  if (affectedCount === 0) {
    return { ok: true, uncategorizedCount: 0 };
  }

  if (category.isFamily && !category.isUncategorizedCollector) {
    const collector = await getOrCreateUncategorizedCollector(accountId, memberId);
    await TodoModel.updateMany(
      { accountId, personalCategoryId: id, deletedAt: null },
      { $set: { personalCategoryId: collector.id } }
    );
  } else {
    await TodoModel.updateMany(
      { accountId, personalCategoryId: id, deletedAt: null },
      { $set: { personalCategoryId: null } }
    );
  }
  return { ok: true, uncategorizedCount: affectedCount };
}
