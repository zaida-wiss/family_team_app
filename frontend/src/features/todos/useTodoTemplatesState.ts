import { useEffect, useState } from "react";
import { todoTemplatesApi } from "../../api";
import { readCache, writeCache } from "../../utils/localCache";
import { deferToIdle } from "../../utils/deferToIdle";
import type { Id, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask } from "@shared/types";

const TASK_TEMPLATES_CACHE_KEY = "task_templates_v1";
const CATEGORY_TEMPLATES_CACHE_KEY = "category_templates_v1";

// Mallbibliotek (2026-07-08, Zaidas önskemål: "det är ingen vits med att spara
// gamla avklarade kopior... jag vill spara både återkommande uppgifter och
// hela kategorier som mall för fler tillfällen då jag får en kopia") — samma
// kontobredda mönster som useTodoCategoriesState.ts.
export function useTodoTemplatesState() {
  // Stale-while-revalidate (2026-07-17) — se useTodosState.ts för samma mönster.
  const [taskTemplates, setTaskTemplates] = useState<TodoTemplate[]>(() => readCache(TASK_TEMPLATES_CACHE_KEY, []));
  const [categoryTemplates, setCategoryTemplates] = useState<TodoCategoryTemplate[]>(() =>
    readCache(CATEGORY_TEMPLATES_CACHE_KEY, [])
  );

  useEffect(() => {
    // Skjuts upp till efter första målningen (2026-07-26, prestandaomgången
    // S1a) — se deferToIdle.ts.
    deferToIdle(() => {
      todoTemplatesApi.getAllTasks().then(setTaskTemplates).catch(console.error);
      todoTemplatesApi.getAllCategories().then(setCategoryTemplates).catch(console.error);
    });
  }, []);

  useEffect(() => {
    writeCache(TASK_TEMPLATES_CACHE_KEY, taskTemplates);
  }, [taskTemplates]);

  useEffect(() => {
    writeCache(CATEGORY_TEMPLATES_CACHE_KEY, categoryTemplates);
  }, [categoryTemplates]);

  function createTaskTemplate(task: TodoTemplateTask) {
    return todoTemplatesApi.createTask(task).then((template) => {
      setTaskTemplates((current) => [...current, template]);
      return template;
    });
  }

  function removeTaskTemplate(id: Id) {
    todoTemplatesApi.removeTask(id).catch(console.error);
    setTaskTemplates((current) => current.filter((t) => t.id !== id));
  }

  // 2026-07-28, Zaidas önskemål: "jag behöver även kunna se och redigera i
  // uppgiftsmallarna" — mallbiblioteket hade tidigare bara se+radera. Bara ett
  // enkelt namnbyte (inte en full redigeringsmodal) — övriga fält (delmoment/
  // återkommelse/stjärnor) sätts redan korrekt vid själva "Spara som mall".
  function renameTaskTemplate(id: Id, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const existing = taskTemplates.find((t) => t.id === id);
    if (!existing) return;
    const { id: _id, accountId: _accountId, memberId: _memberId, createdAt: _createdAt, deletedAt: _deletedAt, ...task } = existing;
    todoTemplatesApi.updateTask(id, { ...task, title: trimmed }).catch(console.error);
    setTaskTemplates((current) => current.map((t) => (t.id === id ? { ...t, title: trimmed } : t)));
  }

  function createCategoryTemplate(name: string, tasks: TodoTemplateTask[], sourceCategoryId?: Id | null) {
    return todoTemplatesApi.createCategory(name, tasks, sourceCategoryId).then((template) => {
      setCategoryTemplates((current) => [...current, template]);
      return template;
    });
  }

  function updateCategoryTemplate(id: Id, name: string, tasks: TodoTemplateTask[]) {
    return todoTemplatesApi.updateCategory(id, name, tasks).then((template) => {
      setCategoryTemplates((current) => current.map((t) => (t.id === id ? template : t)));
      return template;
    });
  }

  function removeCategoryTemplate(id: Id) {
    todoTemplatesApi.removeCategory(id).catch(console.error);
    setCategoryTemplates((current) => current.filter((t) => t.id !== id));
  }

  return {
    taskTemplates,
    categoryTemplates,
    createTaskTemplate,
    removeTaskTemplate,
    renameTaskTemplate,
    createCategoryTemplate,
    updateCategoryTemplate,
    removeCategoryTemplate
  };
}
