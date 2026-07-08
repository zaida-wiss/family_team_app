import { TodoCategoryModel } from "../db/models/TodoCategory.js";
import { MemberModel } from "../db/models/Member.js";
import { RoleModel } from "../db/models/Role.js";
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

export async function createCategory(accountId: string, memberId: string, name: string) {
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

export async function deleteCategory(id: string, accountId: string, memberId: string) {
  await requireAdultMember(memberId, accountId);
  const category = await findCategoryInAccount(id, accountId);
  category.deletedAt = new Date().toISOString();
  category.deletedBy = memberId;
  await category.save();
  return { ok: true };
}
