import { useEffect, useState } from "react";
import { todoTemplatesApi } from "../../api";
import type { Id, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask } from "@shared/types";

// Mallbibliotek (2026-07-08, Zaidas önskemål: "det är ingen vits med att spara
// gamla avklarade kopior... jag vill spara både återkommande uppgifter och
// hela kategorier som mall för fler tillfällen då jag får en kopia") — samma
// kontobredda mönster som useTodoCategoriesState.ts.
export function useTodoTemplatesState() {
  const [taskTemplates, setTaskTemplates] = useState<TodoTemplate[]>([]);
  const [categoryTemplates, setCategoryTemplates] = useState<TodoCategoryTemplate[]>([]);

  useEffect(() => {
    todoTemplatesApi.getAllTasks().then(setTaskTemplates).catch(console.error);
    todoTemplatesApi.getAllCategories().then(setCategoryTemplates).catch(console.error);
  }, []);

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

  function createCategoryTemplate(name: string, tasks: TodoTemplateTask[]) {
    return todoTemplatesApi.createCategory(name, tasks).then((template) => {
      setCategoryTemplates((current) => [...current, template]);
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
    createCategoryTemplate,
    removeCategoryTemplate
  };
}
