import type { Todo } from "@shared/types";
import { api, request, subscribeToServerEvents } from "./client";

export const todosApi = {
  getAll: () => request<Todo[]>(api("todos")),
  create: (todo: Todo) =>
    request<{ id: string }>(api("todos"), { method: "POST", body: JSON.stringify(todo) }),
  update: (id: string, patch: Partial<Todo>) =>
    request<{ ok: boolean }>(api(`todos/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch)
    }),
  complete: (id: string, elapsedMs: number | null = null) =>
    request<{ ok: boolean }>(api(`todos/${id}/complete`), {
      method: "PATCH",
      body: JSON.stringify({ elapsedMs })
    }),
  approve: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/approve`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  reject: (id: string, reason: string | null) =>
    request<{ ok: boolean }>(api(`todos/${id}/reject`), {
      method: "PATCH",
      body: JSON.stringify({ reason })
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}`), { method: "DELETE" }),
  toggleSubtask: (id: string, subtaskId: string) =>
    request<{ done: boolean }>(api(`todos/${id}/subtasks/${subtaskId}`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`todos/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  subscribeToChanges: (onChange: () => void) => {
    let initialConnect = true;
    return subscribeToServerEvents(api("todos/events"), (eventName) => {
      if (eventName === "todos-changed") {
        onChange();
      } else if (eventName === "connected") {
        // Hoppa över den allra första anslutningen — initial fetch sker redan i useTodosState
        if (initialConnect) { initialConnect = false; return; }
        onChange();
      }
    });
  }
};
