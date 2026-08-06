import type { AccessLevel, Id, TodoCategory } from "@shared/types";
import { api, request } from "./client";

// Delning mellan FAMILJER (2026-08-06, Zaidas önskemål: "det skall vara
// möjligt att dela sina egna kategorier med utvalda familjer") — samma
// mönster som ShoppingListShare/ShoppingListShareCandidate i api/shopping.ts
// (ADR-0026).
export type TodoCategoryShare = {
  memberId: string;
  accountId: string;
  access: AccessLevel;
  grantedBy: string;
  grantedAt: string;
  memberName: string;
  accountName: string;
};

export type TodoCategoryShareCandidate = {
  memberId: string;
  accountId: string;
  memberName: string;
  accountName: string;
};

export const todoCategoriesApi = {
  getAll: () => request<TodoCategory[]>(api("todo-categories")),
  create: (name: string, isFamily = false) =>
    request<TodoCategory>(api("todo-categories"), {
      method: "POST",
      body: JSON.stringify({ name, isFamily })
    }),
  rename: (id: Id, name: string) =>
    request<{ ok: boolean }>(api(`todo-categories/${id}`), {
      method: "PATCH",
      body: JSON.stringify({ name })
    }),
  remove: (id: Id) =>
    request<{ ok: boolean }>(api(`todo-categories/${id}`), { method: "DELETE" }),
  setHidden: (id: Id, hidden: boolean) =>
    request<{ ok: boolean }>(api(`todo-categories/${id}/hidden`), {
      method: "PATCH",
      body: JSON.stringify({ hidden })
    }),
  // Delning mellan FAMILJER (2026-08-06).
  listExternalShares: (categoryId: Id) =>
    request<TodoCategoryShare[]>(api(`todo-categories/${categoryId}/external-share`)),
  lookupExternalShareCandidate: (categoryId: Id, email: string) =>
    request<{ memberships: TodoCategoryShareCandidate[] }>(api(`todo-categories/${categoryId}/external-share/lookup`), {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  shareCategoryExternally: (categoryId: Id, granteeMemberId: Id, granteeAccountId: Id, access: AccessLevel) =>
    request<TodoCategoryShare[]>(api(`todo-categories/${categoryId}/external-share`), {
      method: "POST",
      body: JSON.stringify({ granteeMemberId, granteeAccountId, access })
    }),
  revokeExternalShare: (categoryId: Id, granteeAccountId: Id, granteeMemberId: Id) =>
    request<{ ok: boolean }>(api(`todo-categories/${categoryId}/external-share/${granteeAccountId}/${granteeMemberId}`), {
      method: "DELETE"
    })
};
