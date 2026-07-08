import { TodoTemplateModel } from "../db/models/TodoTemplate.js";
import { TodoCategoryTemplateModel } from "../db/models/TodoCategoryTemplate.js";
import { requireAdultMember } from "./todoCategoriesService.js";
import { AppError } from "../utils/errors.js";
import type { TodoTemplateTask } from "../../../shared/types.js";

// Mallbibliotek (2026-07-08) — samma kontobreda/vuxen-bara-mönster som
// TodoCategory (ADR-0019/todoCategoriesService.ts): alla vuxna i kontot ser
// och kan hantera varandras mallar, barn har ingen åtkomst till dessa vyer.

export async function getAllTaskTemplates(accountId: string) {
  return TodoTemplateModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).sort({ createdAt: 1 });
}

export async function createTaskTemplate(accountId: string, memberId: string, task: TodoTemplateTask) {
  await requireAdultMember(memberId, accountId);
  const template = await TodoTemplateModel.create({
    id: `todo-template-${crypto.randomUUID()}`,
    accountId,
    memberId,
    ...task,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    deletedBy: null
  });
  return template.toObject();
}

export async function deleteTaskTemplate(id: string, accountId: string, memberId: string) {
  await requireAdultMember(memberId, accountId);
  const template = await TodoTemplateModel.findOne({ id, accountId, deletedAt: null });
  if (!template) {
    throw new AppError(404, "Mall hittades inte");
  }
  template.deletedAt = new Date().toISOString();
  template.deletedBy = memberId;
  await template.save();
  return { ok: true };
}

export async function getAllCategoryTemplates(accountId: string) {
  return TodoCategoryTemplateModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).sort({ createdAt: 1 });
}

export async function createCategoryTemplate(
  accountId: string,
  memberId: string,
  name: string,
  tasks: TodoTemplateTask[]
) {
  await requireAdultMember(memberId, accountId);
  const trimmed = name.trim();
  if (!trimmed) {
    throw new AppError(400, "Kategorinamn kan inte vara tomt");
  }
  const template = await TodoCategoryTemplateModel.create({
    id: `todo-category-template-${crypto.randomUUID()}`,
    accountId,
    memberId,
    name: trimmed,
    tasks,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    deletedBy: null
  });
  return template.toObject();
}

export async function deleteCategoryTemplate(id: string, accountId: string, memberId: string) {
  await requireAdultMember(memberId, accountId);
  const template = await TodoCategoryTemplateModel.findOne({ id, accountId, deletedAt: null });
  if (!template) {
    throw new AppError(404, "Mall hittades inte");
  }
  template.deletedAt = new Date().toISOString();
  template.deletedBy = memberId;
  await template.save();
  return { ok: true };
}
