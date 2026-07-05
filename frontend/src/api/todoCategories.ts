import type { Id, TodoCategory } from "@shared/types";
import { api, request } from "./client";

export const todoCategoriesApi = {
  getAll: () => request<TodoCategory[]>(api("todo-categories")),
  create: (name: string) =>
    request<TodoCategory>(api("todo-categories"), {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  rename: (id: Id, name: string) =>
    request<{ ok: boolean }>(api(`todo-categories/${id}`), {
      method: "PATCH",
      body: JSON.stringify({ name })
    }),
  remove: (id: Id) =>
    request<{ ok: boolean }>(api(`todo-categories/${id}`), { method: "DELETE" })
};
