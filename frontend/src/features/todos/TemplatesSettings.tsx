import "./TemplatesSettings.css";
import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { Id, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask } from "@shared/types";
import { describeRecurrence, describeRecurrenceEnd } from "./recurringTodos";
import { useDragReorder } from "../../hooks/useDragReorder";
import { TodoTemplateEditModal } from "./TodoTemplateEditModal";

type Props = {
  taskTemplates: TodoTemplate[];
  categoryTemplates: TodoCategoryTemplate[];
  onRemoveTaskTemplate: (id: Id) => void;
  onRemoveCategoryTemplate: (id: Id) => void;
  // Full fältredigering (2026-08-06, Zaidas fråga: "Går alla fält från
  // mallen att redigera i modalerna?") — ersätter det tidigare enkla
  // namnbytet, se TodoTemplateEditModal.tsx.
  onUpdateTaskTemplate: (id: Id, task: TodoTemplateTask) => Promise<unknown>;
  onUpdateCategoryTemplate: (id: Id, name: string, tasks: TodoTemplateTask[]) => void;
  // Manuell ordning (2026-07-29, Zaidas önskemål: "flytta ordningen snabbt i
  // uppgiftsmallarna") — samma "olistade hamnar sist"-princip som
  // RecurringTodosSettings.tsx:s order/onReorder.
  order: Id[];
  onReorder: (order: Id[]) => void;
};

// Mallbibliotek (2026-07-08, Zaidas önskemål: "jag vill spara både
// återkommande uppgifter och hela kategorier som mall för fler tillfällen då
// jag får en kopia") — mallar SKAPAS från Spara som mall-knapparna (kategori-
// menyn/redigera-uppgift-modalen) och HÄMTAS när man skapar en ny uppgift/
// kategori (Ny uppgift-modalen). Den här sektionen är bara för att se
// överblicken och kunna städa bort mallar man inte längre vill ha kvar.
export function TemplatesSettings({
  taskTemplates,
  categoryTemplates,
  onRemoveTaskTemplate,
  onRemoveCategoryTemplate,
  onUpdateTaskTemplate,
  onUpdateCategoryTemplate,
  order,
  onReorder
}: Props) {
  const [editingTaskId, setEditingTaskId] = useState<Id | null>(null);
  const editingTask = taskTemplates.find((t) => t.id === editingTaskId) ?? null;

  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const sortedTaskTemplates = [...taskTemplates].sort((a, b) => {
    const ai = orderIndex.get(a.id);
    const bi = orderIndex.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
  const taskDrag = useDragReorder(
    sortedTaskTemplates.map((t) => t.id),
    onReorder
  );

  // 2026-07-28, Zaidas fynd: "jag måste kunna öppna, se och redigera en
  // kategorimall, nu ser jag inte vad den ens innehåller" — Kategori-mallar
  // visade tidigare bara namn+antal, ingen väg att se eller ändra VILKA
  // uppgifter som faktiskt ingår. Klick på en kategori-mall expanderar nu en
  // lista över dess uppgifter (namn+ikon), med byt namn/ta bort per uppgift
  // och byt namn på hela mallen — sparas via samma redan existerande
  // PATCH-endpoint som "Uppdatera mall" i kategorimenyn (ADR-0022) använder.
  const [expandedCategoryId, setExpandedCategoryId] = useState<Id | null>(null);
  const [categoryNameDraft, setCategoryNameDraft] = useState("");
  const [categoryTasksDraft, setCategoryTasksDraft] = useState<TodoTemplateTask[]>([]);

  function toggleCategory(template: TodoCategoryTemplate) {
    if (expandedCategoryId === template.id) {
      setExpandedCategoryId(null);
      return;
    }
    setExpandedCategoryId(template.id);
    setCategoryNameDraft(template.name);
    setCategoryTasksDraft(template.tasks);
  }

  function saveCategoryName() {
    if (expandedCategoryId) onUpdateCategoryTemplate(expandedCategoryId, categoryNameDraft, categoryTasksDraft);
  }

  function updateTaskTitle(index: number, title: string) {
    setCategoryTasksDraft((current) => current.map((t, i) => (i === index ? { ...t, title } : t)));
  }

  function saveTaskTitle() {
    if (expandedCategoryId) onUpdateCategoryTemplate(expandedCategoryId, categoryNameDraft, categoryTasksDraft);
  }

  function removeTaskAt(index: number) {
    if (!expandedCategoryId) return;
    const next = categoryTasksDraft.filter((_, i) => i !== index);
    setCategoryTasksDraft(next);
    onUpdateCategoryTemplate(expandedCategoryId, categoryNameDraft, next);
  }

  if (taskTemplates.length === 0 && categoryTemplates.length === 0) {
    return <p className="empty-note">Inga sparade mallar än. Spara en uppgift eller en hel kategori som mall för att se den här.</p>;
  }

  return (
    <div className="templates-settings">
      {categoryTemplates.length > 0 && (
        <div className="templates-settings__group">
          <h4 className="templates-settings__heading">Kategori-mallar</h4>
          <ul className="templates-settings__list">
            {categoryTemplates.map((template) => {
              const isExpanded = expandedCategoryId === template.id;
              return (
                <li className="templates-settings__category" key={template.id}>
                  <div className="templates-settings__row">
                    <button
                      aria-expanded={isExpanded}
                      aria-label={`Visa/dölj innehållet i mallen ${template.name}`}
                      className="icon-button"
                      onClick={() => toggleCategory(template)}
                      type="button"
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {isExpanded ? (
                      <input
                        aria-label={`Byt namn på mallen ${template.name}`}
                        className="text-input templates-settings__rename-input"
                        onBlur={saveCategoryName}
                        onChange={(e) => setCategoryNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        value={categoryNameDraft}
                      />
                    ) : (
                      <span
                        className="templates-settings__title"
                        onClick={() => toggleCategory(template)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") toggleCategory(template);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        {template.name} <small>({template.tasks.length} uppgifter)</small>
                      </span>
                    )}
                    <button
                      aria-label={`Ta bort mallen ${template.name}`}
                      className="icon-button danger"
                      onClick={() => onRemoveCategoryTemplate(template.id)}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {isExpanded && (
                    <ul className="templates-settings__category-tasks">
                      {categoryTasksDraft.length === 0 ? (
                        <li className="empty-note">Inga uppgifter kvar i den här mallen.</li>
                      ) : (
                        categoryTasksDraft.map((task, index) => (
                          <li className="templates-settings__category-task" key={index}>
                            {task.visual.value && <span aria-hidden="true">{task.visual.value}</span>}
                            <input
                              aria-label={`Uppgift ${index + 1} i mallen ${template.name}`}
                              className="text-input templates-settings__rename-input"
                              onBlur={saveTaskTitle}
                              onChange={(e) => updateTaskTitle(index, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                              value={task.title}
                            />
                            {task.subtasks.length > 0 && <small>{task.subtasks.length} delmoment</small>}
                            <button
                              aria-label={`Ta bort uppgiften ${task.title} från mallen`}
                              className="icon-button danger"
                              onClick={() => removeTaskAt(index)}
                              type="button"
                            >
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sortedTaskTemplates.length > 0 && (
        <div className="templates-settings__group">
          <h4 className="templates-settings__heading">Uppgiftsmallar</h4>
          <ul className="templates-settings__list">
            {sortedTaskTemplates.map((template) => {
              const recurrenceLabel = describeRecurrence(template.recurrence);
              const endLabel = describeRecurrenceEnd(template.recurrence);
              return (
                <li
                  className={`templates-settings__row${taskDrag.dragOverKey === template.id ? " templates-settings__row--drag-over" : ""}`}
                  data-drag-key={template.id}
                  key={template.id}
                >
                  <button
                    aria-label={`Flytta ${template.title}`}
                    className="icon-button templates-settings__drag-handle"
                    onPointerDown={(e) => taskDrag.handlePointerDown(e, template.id)}
                    onPointerMove={taskDrag.handlePointerMove}
                    onPointerUp={taskDrag.handlePointerUp}
                    type="button"
                  >
                    <GripVertical size={16} />
                  </button>
                  <div className="templates-settings__info">
                    <span
                      className="templates-settings__title"
                      onClick={() => setEditingTaskId(template.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setEditingTaskId(template.id);
                      }}
                    >
                      {template.title}
                    </span>
                    {recurrenceLabel && (
                      <small>
                        {recurrenceLabel}
                        {endLabel && ` · ${endLabel}`}
                        {template.timerEnabled && " · Tidtagning"}
                      </small>
                    )}
                  </div>
                  <button
                    aria-label={`Redigera mallen ${template.title}`}
                    className="icon-button"
                    onClick={() => setEditingTaskId(template.id)}
                    type="button"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={`Ta bort mallen ${template.title}`}
                    className="icon-button danger"
                    onClick={() => onRemoveTaskTemplate(template.id)}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>

          {editingTask && (
            <TodoTemplateEditModal
              onClose={() => setEditingTaskId(null)}
              onUpdate={onUpdateTaskTemplate}
              template={editingTask}
            />
          )}
        </div>
      )}
    </div>
  );
}
