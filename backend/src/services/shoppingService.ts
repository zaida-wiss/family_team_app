import { ShoppingListModel } from "../db/models/ShoppingList.js";
import { MemberModel } from "../db/models/Member.js";
import { AppError } from "../utils/errors.js";
import { ShoppingItemSchema } from "../../../shared/schemas.js";
import { getAllRoles } from "./rolesService.js";
import { canEditSharedResource, hasPermission } from "../../../shared/permissions.js";
import type { PermissionKey, ShoppingList } from "../../../shared/types.js";

// Säkerhetsfynd 2026-07-22 (samma klass som ADR-0009/ADR-0016/timedTasks.ts):
// samtliga skrivningar i den här filen saknade server-side behörighetskontroll,
// bara addItem/toggleItem/shareList/unshareList/deleteList/createList/
// restoreList. Fixat samma dag genom att återanvända requireEditAccess
// (skrevs redan för deleteItem/clearCompletedItems) + en ny requirePermission
// för de fall som inte utgår från en specifik listas ägar-/delningsstatus.
async function requireMember(accountId: string, memberId: string | null) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return member;
}

async function requireEditAccess(list: ShoppingList, accountId: string, memberId: string | null) {
  const member = await requireMember(accountId, memberId);
  const roles = await getAllRoles(accountId);
  if (!hasPermission(member, roles, "canEditShoppingLists") || !canEditSharedResource(member, list)) {
    throw new AppError(403, "Åtkomst nekad");
  }
}

async function requirePermission(accountId: string, memberId: string | null, permission: PermissionKey) {
  const member = await requireMember(accountId, memberId);
  const roles = await getAllRoles(accountId);
  if (!hasPermission(member, roles, permission)) {
    throw new AppError(403, "Åtkomst nekad");
  }
}

export async function getAllLists(accountId: string) {
  return ShoppingListModel.find({ accountId }, { _id: 0, __v: 0 });
}

export async function createList(data: unknown, accountId: string, memberId: string | null) {
  await requirePermission(accountId, memberId, "canCreateShoppingLists");
  // ownerId sätts alltid till den riktiga anroparen — data.ownerId ignoreras
  // (mass-assignment-skydd, samma mönster som ADR-0008) för att förhindra att
  // en manipulerad body ger en lista bort till en annan medlem.
  const list = new ShoppingListModel({ ...(data as object), accountId, ownerId: memberId });
  await list.save();
  return { id: list.id };
}

export async function addItem(listId: string, accountId: string, memberId: string, item: unknown) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, memberId);
  const validated = ShoppingItemSchema.parse(item);
  list.items.push({ ...validated, createdBy: memberId } as any);
  await list.save();
}

export async function toggleItem(listId: string, accountId: string, itemId: string, memberId: string | null) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, memberId);
  const item = list.items.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Vara hittades inte");
  }
  item.done = !item.done;
  list.markModified("items");
  await list.save();
}

export async function shareList(
  listId: string,
  accountId: string,
  callerMemberId: string | null,
  targetMemberId: string,
  access: "view" | "edit"
) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, callerMemberId);
  const existing = list.sharedWith.find((s) => s.memberId === targetMemberId);
  if (existing) {
    existing.access = access;
  } else {
    list.sharedWith.push({ memberId: targetMemberId, access });
  }
  list.markModified("sharedWith");
  await list.save();
}

export async function unshareList(
  listId: string,
  accountId: string,
  callerMemberId: string | null,
  targetMemberId: string
) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, callerMemberId);
  list.sharedWith = list.sharedWith.filter((s) => s.memberId !== targetMemberId);
  list.markModified("sharedWith");
  await list.save();
}

export async function deleteList(id: string, accountId: string, memberId: string | null) {
  const list = await ShoppingListModel.findOne({ id, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, memberId);
  list.deletedAt = new Date().toISOString();
  list.deletedBy = memberId;
  await list.save();
}

// Sprint 8 S3 (2026-07-17) fixade samma lucka för restoreTodo — samma mönster
// här: canRestoreFromTrash, inte requireEditAccess (en raderad lista har ingen
// meningsfull delnings-status kvar att kontrollera mot).
export async function restoreList(id: string, accountId: string, memberId: string | null) {
  const list = await ShoppingListModel.findOne({ id, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requirePermission(accountId, memberId, "canRestoreFromTrash");
  list.deletedAt = null;
  list.deletedBy = null;
  await list.save();
}

export async function deleteItem(listId: string, accountId: string, itemId: string, memberId: string | null) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, memberId);
  const item = list.items.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Vara hittades inte");
  }
  item.deletedAt = new Date().toISOString();
  item.deletedBy = memberId;
  list.markModified("items");
  await list.save();
}

// Töm listan (2026-07-22, Zaidas önskemål) — rensar bara BOCKADE varor, inte
// hela listan. En återkommande inköpslista fylls annars på och blir svår att
// överblicka efter ett handlat pass; en enskild vara raderas via deleteItem.
export async function clearCompletedItems(listId: string, accountId: string, memberId: string | null) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, memberId);
  const now = new Date().toISOString();
  let changed = false;
  for (const item of list.items) {
    if (item.done && item.deletedAt === null) {
      item.deletedAt = now;
      item.deletedBy = memberId;
      changed = true;
    }
  }
  if (changed) {
    list.markModified("items");
    await list.save();
  }
}

// ADR-0025 (2026-07-23, Zaidas beslut): explicit, permanent tömning av
// papperskorgen — ett medvetet undantag från "aldrig hard delete"-regeln,
// scopat strikt till listor som redan gått igenom mjuk radering. Riktig
// deleteMany, ingen väg tillbaka.
export async function purgeTrash(accountId: string, memberId: string | null) {
  await requirePermission(accountId, memberId, "canRestoreFromTrash");
  await ShoppingListModel.deleteMany({ accountId, deletedAt: { $ne: null } });
}
