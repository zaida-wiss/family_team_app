import type { AccessLevel, ShoppingList } from "@shared/types";
import { api, request } from "./client";

// Delning mellan FAMILJER (ADR-0026, 2026-07-23) — se ChildShare/
// ChildShareCandidate i api/members.ts för samma mönster.
export type ShoppingListShare = {
  memberId: string;
  accountId: string;
  access: AccessLevel;
  grantedBy: string;
  grantedAt: string;
};

export type ShoppingListShareCandidate = {
  memberId: string;
  accountId: string;
  memberName: string;
  accountName: string;
};

export type ExternallySharedShoppingList = {
  list: Pick<ShoppingList, "id" | "accountId" | "name" | "color" | "icon" | "items">;
  access: AccessLevel;
};

export const shoppingApi = {
  getAll: () => request<ShoppingList[]>(api("shopping")),
  create: (list: ShoppingList) =>
    request<{ id: string }>(api("shopping"), { method: "POST", body: JSON.stringify(list) }),
  addItem: (listId: string, item: ShoppingList["items"][number]) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/items`), {
      method: "POST",
      body: JSON.stringify(item)
    }),
  toggleItem: (listId: string, itemId: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/items/${itemId}/toggle`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  removeItem: (listId: string, itemId: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/items/${itemId}`), { method: "DELETE" }),
  clearCompleted: (listId: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/clear-completed`), {
      method: "POST",
      body: JSON.stringify({})
    }),
  share: (listId: string, memberId: string, access: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/share`), {
      method: "POST",
      body: JSON.stringify({ memberId, access })
    }),
  unshare: (listId: string, memberId: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/share/${memberId}`), { method: "DELETE" }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`shopping/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`shopping/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  purgeTrash: () =>
    request<{ ok: boolean }>(api("shopping/purge-trash"), { method: "POST", body: JSON.stringify({}) }),
  // Delning mellan FAMILJER (ADR-0026, 2026-07-23).
  listExternalShares: (listId: string) =>
    request<ShoppingListShare[]>(api(`shopping/${listId}/external-share`)),
  lookupExternalShareCandidate: (listId: string, email: string) =>
    request<{ memberships: ShoppingListShareCandidate[] }>(api(`shopping/${listId}/external-share/lookup`), {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  shareListExternally: (listId: string, granteeMemberId: string, granteeAccountId: string, access: AccessLevel) =>
    request<ShoppingListShare[]>(api(`shopping/${listId}/external-share`), {
      method: "POST",
      body: JSON.stringify({ granteeMemberId, granteeAccountId, access })
    }),
  revokeExternalShare: (listId: string, granteeAccountId: string, granteeMemberId: string) =>
    request<{ ok: boolean }>(api(`shopping/${listId}/external-share/${granteeAccountId}/${granteeMemberId}`), {
      method: "DELETE"
    }),
  getExternallyShared: () => request<ExternallySharedShoppingList[]>(api("shopping/shared-lists")),
  addItemToExternal: (listId: string, listAccountId: string, item: ShoppingList["items"][number]) =>
    request<{ ok: boolean }>(api(`shopping/shared/${listAccountId}/${listId}/items`), {
      method: "POST",
      body: JSON.stringify(item)
    }),
  toggleExternalItem: (listId: string, listAccountId: string, itemId: string) =>
    request<{ ok: boolean }>(api(`shopping/shared/${listAccountId}/${listId}/items/${itemId}/toggle`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  removeExternalItem: (listId: string, listAccountId: string, itemId: string) =>
    request<{ ok: boolean }>(api(`shopping/shared/${listAccountId}/${listId}/items/${itemId}`), {
      method: "DELETE"
    })
};
