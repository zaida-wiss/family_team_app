import { TodoCategoryModel } from "../db/models/TodoCategory.js";
import { AppError } from "../utils/errors.js";

// Personliga (per medlem) — en medlem kan bara se/ändra sina egna kategorier,
// inte andra familjemedlemmars, trots att de delar samma konto.
export async function getOwnCategories(accountId: string, memberId: string) {
  return TodoCategoryModel.find(
    { accountId, memberId, deletedAt: null },
    { _id: 0, __v: 0 }
  ).sort({ createdAt: 1 });
}

export async function createCategory(accountId: string, memberId: string, name: string) {
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

async function findOwnCategory(id: string, accountId: string, memberId: string) {
  const category = await TodoCategoryModel.findOne({ id, accountId, memberId, deletedAt: null });
  if (!category) {
    throw new AppError(404, "Kategori hittades inte");
  }
  return category;
}

export async function renameCategory(id: string, accountId: string, memberId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError(400, "Kategorinamn kan inte vara tomt");
  }
  const category = await findOwnCategory(id, accountId, memberId);
  category.name = trimmed;
  await category.save();
  return { ok: true };
}

export async function deleteCategory(id: string, accountId: string, memberId: string) {
  const category = await findOwnCategory(id, accountId, memberId);
  category.deletedAt = new Date().toISOString();
  category.deletedBy = memberId;
  await category.save();
  return { ok: true };
}
