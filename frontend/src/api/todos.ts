import type { Todo } from "@shared/types";
import { api, request } from "./client";

export const todosApi = {
  getAll: () => request<Todo[]>(api("todos")),
  create: (todo: Todo) =>
    request<{ id: string }>(api("todos"), { method: "POST", body: JSON.stringify(todo) }),
  update: (id: string, patch: Partial<Todo>) =>
    request<{ ok: boolean }>(api(`todos/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  complete: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  approve: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  reject: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    })
};
