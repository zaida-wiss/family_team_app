import { ShoppingListModel } from "../db/models/ShoppingList.js";
import { AppError } from "../utils/errors.js";

export async function getAllLists(accountId: string) {
  return ShoppingListModel.find({ accountId }, { _id: 0, __v: 0 });
}

export async function createList(data: unknown) {
  const list = new ShoppingListModel(data);
  await list.save();
  return { id: list.id };
}

export async function addItem(listId: string, item: unknown) {
  const list = await ShoppingListModel.findOne({ id: listId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  list.items.push(item as any);
  await list.save();
}

export async function toggleItem(listId: string, itemId: string) {
  const list = await ShoppingListModel.findOne({ id: listId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  const item = list.items.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Vara hittades inte");
  }
  item.done = !item.done;
  list.markModified("items");
  await list.save();
}

export async function shareList(listId: string, memberId: string, access: "view" | "edit") {
  const list = await ShoppingListModel.findOne({ id: listId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  const existing = list.sharedWith.find((s) => s.memberId === memberId);
  if (existing) {
    existing.access = access;
  } else {
    list.sharedWith.push({ memberId, access });
  }
  list.markModified("sharedWith");
  await list.save();
}

export async function unshareList(listId: string, memberId: string) {
  const list = await ShoppingListModel.findOne({ id: listId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  list.sharedWith = list.sharedWith.filter((s) => s.memberId !== memberId);
  list.markModified("sharedWith");
  await list.save();
}

export async function deleteList(id: string, memberId: string | null) {
  const list = await ShoppingListModel.findOne({ id });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  list.deletedAt = new Date().toISOString();
  list.deletedBy = memberId;
  await list.save();
}

export async function restoreList(id: string) {
  const list = await ShoppingListModel.findOne({ id });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  list.deletedAt = null;
  list.deletedBy = null;
  await list.save();
}
