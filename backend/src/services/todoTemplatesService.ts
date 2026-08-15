import { TodoTemplateModel } from "../db/models/TodoTemplate.js";
import { TodoCategoryTemplateModel } from "../db/models/TodoCategoryTemplate.js";
import { requireAdultMember } from "./todoCategoriesService.js";
import { AppError } from "../utils/errors.js";
import { encryptField, encryptNullable, decryptField, decryptNullable } from "../utils/fieldEncryption.js";
import type { TodoTemplateTask } from "../../../shared/types.js";

// Mallbibliotek (2026-07-08) — samma kontobreda/vuxen-bara-mönster som
// TodoCategory (ADR-0019/todoCategoriesService.ts): alla vuxna i kontot ser
// och kan hantera varandras mallar, barn har ingen åtkomst till dessa vyer.

// Fält-kryptering (ADR-0014), tillagd 2026-07-28 — mallbiblioteket saknade
// helt kryptering trots att en mall är en kopia av samma känsliga innehåll
// (title/notes/subtask-titel) som en riktig Todo redan krypterar. Kategorins
// EGET namn ("Hushåll" etc.) krypteras medvetet INTE — matchar TodoCategory.name,
// som aldrig varit krypterad (en mapp-etikett, inte fritt innehåll).
function encryptTask(accountId: string, task: TodoTemplateTask): TodoTemplateTask {
  return {
    ...task,
    title: encryptField(accountId, task.title),
    notes: encryptNullable(accountId, task.notes) ?? null,
    subtasks: task.subtasks.map((s) => ({ ...s, title: encryptField(accountId, s.title) }))
  };
}

function decryptTask<T extends TodoTemplateTask>(accountId: string, task: T): T {
  return {
    ...task,
    title: decryptField(accountId, task.title),
    notes: decryptNullable(accountId, task.notes) ?? null,
    subtasks: task.subtasks.map((s) => ({ ...s, title: decryptField(accountId, s.title) }))
  };
}

export async function getAllTaskTemplates(accountId: string) {
  const templates = await TodoTemplateModel.find({ accountId, deletedAt: null }, { _id: 0, __v: 0 }).sort({
    createdAt: 1
  });
  return templates.map((t) => decryptTask(accountId, t.toObject()));
}

export async function createTaskTemplate(accountId: string, memberId: string, task: TodoTemplateTask) {
  await requireAdultMember(memberId, accountId);
  const template = await TodoTemplateModel.create({
    id: `todo-template-${crypto.randomUUID()}`,
    accountId,
    memberId,
    ...encryptTask(accountId, task),
    createdAt: new Date().toISOString(),
    deletedAt: null,
    deletedBy: null
  });
  return decryptTask(accountId, template.toObject());
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

// 2026-07-28, Zaidas önskemål: "jag behöver även kunna se och redigera i
// uppgiftsmallarna" — TemplatesSettings.tsx visade tidigare bara namnet +
// en radera-knapp, ingen väg att ändra innehållet efter att mallen sparats.
export async function updateTaskTemplate(id: string, accountId: string, memberId: string, task: TodoTemplateTask) {
  await requireAdultMember(memberId, accountId);
  const template = await TodoTemplateModel.findOne({ id, accountId, deletedAt: null });
  if (!template) {
    throw new AppError(404, "Mall hittades inte");
  }
  const encrypted = encryptTask(accountId, task);
  template.title = encrypted.title;
  template.visual = encrypted.visual;
  template.notes = encrypted.notes;
  template.subtasks = encrypted.subtasks as never;
  template.recurrence = encrypted.recurrence as never;
  template.starValue = encrypted.starValue;
  // Tidtagning (2026-08-06) — glömda här trots att endpointen redan tog
  // emot en FULL TodoTemplateTask, samma bugklass som todoThreadGap en
  // gång var (ett fält som fanns i typen/Mongoose-schemat men aldrig
  // faktiskt skrevs av update-funktionen).
  template.timerEnabled = encrypted.timerEnabled ?? false;
  template.plannedDurationMinutes = encrypted.plannedDurationMinutes ?? null;
  // Auto-stopp (2026-08-15) — samma "glömda här"-bugklass som raderna ovan.
  template.timerMaxMinutes = encrypted.timerMaxMinutes ?? null;
  template.markModified("subtasks");
  await template.save();
  return decryptTask(accountId, template.toObject());
}

export async function getAllCategoryTemplates(accountId: string) {
  const templates = await TodoCategoryTemplateModel.find(
    { accountId, deletedAt: null },
    { _id: 0, __v: 0 }
  ).sort({ createdAt: 1 });
  return templates.map((t) => {
    const obj = t.toObject();
    return { ...obj, tasks: obj.tasks.map((task) => decryptTask(accountId, task)) };
  });
}

export async function createCategoryTemplate(
  accountId: string,
  memberId: string,
  name: string,
  tasks: TodoTemplateTask[],
  sourceCategoryId?: string | null
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
    tasks: tasks.map((task) => encryptTask(accountId, task)),
    createdAt: new Date().toISOString(),
    deletedAt: null,
    deletedBy: null,
    sourceCategoryId: sourceCategoryId ?? null
  });
  const obj = template.toObject();
  return { ...obj, tasks: obj.tasks.map((task) => decryptTask(accountId, task)) };
}

// 2026-07-28, Zaidas önskemål: "man ska alltid kunna uppdatera mallen i
// kategorimenyn, om man tex ändrat ordning på dem" — uppdaterar en redan
// sparad kategori-mall i stället för att skapa en duplicerad ny. Rör aldrig
// sourceCategoryId (satt en gång vid skapande).
export async function updateCategoryTemplate(
  id: string,
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
  const template = await TodoCategoryTemplateModel.findOne({ id, accountId, deletedAt: null });
  if (!template) {
    throw new AppError(404, "Mall hittades inte");
  }
  template.name = trimmed;
  template.tasks = tasks.map((task) => encryptTask(accountId, task)) as never;
  template.markModified("tasks");
  await template.save();
  const obj = template.toObject();
  return { ...obj, tasks: obj.tasks.map((task) => decryptTask(accountId, task)) };
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
