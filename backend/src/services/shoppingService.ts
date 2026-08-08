import { ShoppingListModel } from "../db/models/ShoppingList.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "../utils/errors.js";
import { ShoppingItemSchema, ShoppingListPatchSchema } from "../../../shared/schemas.js";
import { getAllRoles } from "./rolesService.js";
import { canEditSharedResource, getExternalShoppingListAccess, hasPermission } from "../../../shared/permissions.js";
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

// Fixat 2026-08-06 (samma klass av bugg som todosService.ts:s getAllTodos
// innan 2026-07-26-fixen — Zaidas Lighthouse-rapport visade flera ovanligt
// stora API-svar, en skrivskyddad kontroll mot produktion bekräftade att
// getAllLists aldrig filtrerat bort mjuk-raderade listor ELLER varor):
// mjuk-raderade LISTOR flyttas nu till en egen getDeletedLists nedan (TrashView
// behöver fortfarande kunna visa/återställa dem), och mjuk-raderade VAROR
// inom en aktiv lista (bockade+borttagna, eller enskilt raderade) strippas
// helt ur svaret — ingen UI läser dem (ShoppingView.tsx/ShoppingListsPanel.tsx
// filtrerar redan bort item.deletedAt!==null klientsidan, och det finns
// ingen papperskorgs-vy för enskilda varor, bara för hela listor).
export async function getAllLists(accountId: string) {
  const lists = await ShoppingListModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).lean();
  return lists.map((list) => ({
    ...list,
    items: list.items.filter((item) => item.deletedAt === null)
  }));
}

// Papperskorg (2026-08-06) — samma "huvudlistan visar bara aktivt, en egen
// väg för det raderade"-princip som todosService.ts:s getTodosHistoryPage,
// men medvetet UTAN paginering: en hel inköpslista raderas sällan (låg
// volym jämfört med enskilda todos), en enkel obegränsad lista är
// proportionerlig här.
export async function getDeletedLists(accountId: string) {
  return ShoppingListModel.find({ accountId, deletedAt: { $ne: null } }, { _id: 0, __v: 0 }).lean();
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

// Mina familjekonton (2026-08-01, Zaidas önskemål: "samma gäller
// inköpslistan" — precis som cross-account-todos/kalendrar, mina EGNA
// riktiga medlemskap i andra konton) — till skillnad från kalendrar (som
// kräver ett explicit shareAcrossMyAccounts-flagg per kalender) är
// inköpslistor redan ett "hela familjen delar"-koncept i den här appen, så
// ALLA listor i det andra kontot visas, ingen egen opt-in behövs.
export async function getCrossAccountShoppingLists(callerUserId: string, currentAccountId: string, currentMemberId: string) {
  const currentMember = await MemberModel.findOne({ id: currentMemberId, accountId: currentAccountId });
  const hidden = new Set(currentMember?.hiddenCrossAccountIds ?? []);

  const memberDocs = await MemberModel.find({ userId: callerUserId, deletedAt: null });
  const results = [];
  for (const m of memberDocs) {
    if (!m.accountId || m.accountId === currentAccountId || hidden.has(m.accountId)) continue;
    const account = await AccountModel.findOne({ id: m.accountId, deletedAt: null });
    if (!account) continue;
    const lists = await getAllLists(m.accountId);
    results.push({ accountId: m.accountId, accountName: account.name, lists });
  }
  return results;
}

// Ny lista "förinställd på familjen" direkt i ETT AV MINA ANDRA konton
// (2026-08-01) — samma createList/canCreateShoppingLists-kontroll som
// vanligt, bara riktad mot en annan medlemspost (min egen, DÄR).
export async function createCrossAccountShoppingList(callerUserId: string, targetAccountId: string, data: unknown) {
  const memberInTarget = await MemberModel.findOne({ userId: callerUserId, accountId: targetAccountId, deletedAt: null });
  if (!memberInTarget) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return createList(data, targetAccountId, memberInTarget.id);
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

// 2026-07-28, Zaidas önskemål: "inköpslistorna måste gå att ändra namn på
// när man trycker på redigera" — samma requireEditAccess som övriga
// skrivningar i denna fil.
export async function updateList(id: string, accountId: string, memberId: string | null, data: unknown) {
  const list = await ShoppingListModel.findOne({ id, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, memberId);
  const validated = ShoppingListPatchSchema.parse(data);
  list.name = validated.name;
  await list.save();
  return { id: list.id, name: list.name };
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

// Drag-and-drop-ordning på varorna (2026-07-26, Zaidas önskemål) — itemIds
// är den nya, kompletta ordningen (klienten känner till alla synliga
// id:n). Varor som saknas i listan (t.ex. en samtidig radering från en
// annan enhet) hamnar sist i sin befintliga inbördes ordning, defensivt —
// ingen kastas bort.
export async function reorderItems(listId: string, accountId: string, memberId: string | null, itemIds: string[]) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  await requireEditAccess(list, accountId, memberId);
  const byId = new Map(list.items.map((item) => [item.id, item]));
  const ordered = itemIds.map((id) => byId.get(id)).filter((item): item is NonNullable<typeof item> => item !== undefined);
  const orderedIds = new Set(ordered.map((item) => item.id));
  const rest = list.items.filter((item) => !orderedIds.has(item.id));
  list.items = [...ordered, ...rest] as typeof list.items;
  list.markModified("items");
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

// Delning mellan FAMILJER (ADR-0026, 2026-07-23) — se shoppingSharesService.ts
// för hantering av SJÄLVA delningen (lookup/dela/återkalla, alltid inom
// listans EGET konto). Funktionerna nedan rör INTE den vanliga
// kontoscopade getAllLists ovan alls, en helt separat, additiv väg — samma
// mönster som todosService.ts:s getSharedChildrenTodos/completeSharedChildTodo
// (ADR-0024).
async function requireCallerWithAccess(
  listId: string,
  listAccountId: string,
  callerMemberId: string,
  callerAccountId: string,
  needed: "view" | "edit"
) {
  const list = await ShoppingListModel.findOne({ id: listId, accountId: listAccountId, deletedAt: null });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  const caller = await requireMember(callerAccountId, callerMemberId);
  const access = getExternalShoppingListAccess(caller, list);
  if (access === null || (needed === "edit" && access !== "edit")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return list;
}

export async function getExternallySharedLists(callerMemberId: string, callerAccountId: string) {
  const lists = await ShoppingListModel.find({
    deletedAt: null,
    externalSharedWith: { $elemMatch: { memberId: callerMemberId, accountId: callerAccountId } }
  });

  return lists.map((list) => {
    const grant = (list.externalSharedWith ?? []).find(
      (s) => s.memberId === callerMemberId && s.accountId === callerAccountId
    );
    return {
      list: {
        id: list.id,
        accountId: list.accountId,
        name: list.name,
        color: list.color,
        icon: list.icon,
        items: list.items.filter((item) => item.deletedAt === null)
      },
      access: grant?.access ?? "view"
    };
  });
}

export async function addItemToExternalList(
  listId: string,
  listAccountId: string,
  callerMemberId: string,
  callerAccountId: string,
  item: unknown
) {
  const list = await requireCallerWithAccess(listId, listAccountId, callerMemberId, callerAccountId, "edit");
  const validated = ShoppingItemSchema.parse(item);
  list.items.push({ ...validated, createdBy: callerMemberId } as any);
  await list.save();
}

export async function toggleExternalItem(
  listId: string,
  listAccountId: string,
  itemId: string,
  callerMemberId: string,
  callerAccountId: string
) {
  const list = await requireCallerWithAccess(listId, listAccountId, callerMemberId, callerAccountId, "edit");
  const item = list.items.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Vara hittades inte");
  }
  item.done = !item.done;
  list.markModified("items");
  await list.save();
}

export async function deleteExternalItem(
  listId: string,
  listAccountId: string,
  itemId: string,
  callerMemberId: string,
  callerAccountId: string
) {
  const list = await requireCallerWithAccess(listId, listAccountId, callerMemberId, callerAccountId, "edit");
  const item = list.items.find((i) => i.id === itemId);
  if (!item) {
    throw new AppError(404, "Vara hittades inte");
  }
  item.deletedAt = new Date().toISOString();
  item.deletedBy = callerMemberId;
  list.markModified("items");
  await list.save();
}
