import type { Id, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask } from "@shared/types";
import { api, request } from "./client";

export const todoTemplatesApi = {
  getAllTasks: () => request<TodoTemplate[]>(api("todo-templates/tasks")),
  createTask: (task: TodoTemplateTask) =>
    request<TodoTemplate>(api("todo-templates/tasks"), {
      method: "POST",
      body: JSON.stringify(task)
    }),
  removeTask: (id: Id) =>
    request<{ ok: boolean }>(api(`todo-templates/tasks/${id}`), { method: "DELETE" }),
  getAllCategories: () => request<TodoCategoryTemplate[]>(api("todo-templates/categories")),
  createCategory: (name: string, tasks: TodoTemplateTask[]) =>
    request<TodoCategoryTemplate>(api("todo-templates/categories"), {
      method: "POST",
      body: JSON.stringify({ name, tasks })
    }),
  removeCategory: (id: Id) =>
    request<{ ok: boolean }>(api(`todo-templates/categories/${id}`), { method: "DELETE" })
};
