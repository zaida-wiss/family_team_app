import type { ShoppingList } from "@shared/types";
import { api, request } from "./client";

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
    })
};
