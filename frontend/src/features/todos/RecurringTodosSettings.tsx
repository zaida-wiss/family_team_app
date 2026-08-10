import "./RecurringTodosSettings.css";
import { useState } from "react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { Id, Member, Role, Todo, TodoCategory, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask } from "@shared/types";
import { getAssigneeName, getVisibleTodos, groupByChildAssignee } from "./selectors";
import { describeRecurrence, describeRecurrenceEnd, isoToDateOnly, isRecurringTemplate } from "./recurringTodos";
import { useDragReorder } from "../../hooks/useDragReorder";
import { TodoEditModal } from "./TodoEditModal";
import { TodoCreatorModal } from "./TodoCreatorModal";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  categories: TodoCategory[];
  taskTemplates: TodoTemplate[];
  categoryTemplates: TodoCategoryTemplate[];
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCreateTodo: (todo: Todo) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onDeleteTodo: (todoId: Id) => void;
  onRefreshRoutine: (routineId: Id) => void;
  fixedTodoTimes: boolean;
  // Manuell ordning (2026-07-28, Zaidas önskemål: "ändra ordning på dem") —
  // lista av mall-id:n, samma "olistade hamnar sist"-princip som
  // todoThreadOrder.
  order: Id[];
  onReorder: (order: Id[]) => void;
};

// Ankardatumets tidsstämpel, för sortering — mallar utan startdatum (borde
// inte förekomma i praktiken, se ADR-0015/incidents/2026-07-06) hamnar sist
// istället för att krascha sorteringen.
function startTimeValue(todo: Todo): number {
  return todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.POSITIVE_INFINITY;
}

// "Sluttid" (2026-07-29, Zaidas önskemål: "sortera... efter namn, starttid
// och sluttid") — en mall har bara ett riktigt slutDATUM när dess
// återkommelse har ett explicit "until"-slutvillkor (ADR-0017); "never"/
// "count" har inget fast datum att sortera på, hamnar sist precis som en
// mall utan startdatum.
function endTimeValue(todo: Todo): number {
  const recurrence = todo.recurrence;
  if (recurrence.type === "recurring" && recurrence.end?.type === "until") {
    return new Date(recurrence.end.date).getTime();
  }
  return Number.POSITIVE_INFINITY;
}

type SortMode = "manual" | "name" | "start" | "end";
type MemberFilter = "all" | "family" | Id;

// De återkommande MALLARNA (recurringSourceId===null) visas inte längre som
// vanliga bollar/rader i Todos-panelen (2026-07-06) — de tävlade om
// uppmärksamhet med sin egen dagliga occurrence och såg ut som en dubblett
// (Zaida). Mallen är dock fortfarande det enda stället där man kan ändra
// återkommelsemönstret eller stoppa en serie helt, så den behöver en egen,
// separat hanteringsyta i Inställningar istället för att bara försvinna.
export function RecurringTodosSettings({
  currentMember,
  members,
  roles,
  todos,
  categories,
  taskTemplates,
  categoryTemplates,
  onUpdateTodo,
  onCreateTodo,
  onCreateCategory,
  onCreateTaskTemplate,
  onDeleteTodo,
  onRefreshRoutine,
  fixedTodoTimes,
  order,
  onReorder
}: Props) {
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [creating, setCreating] = useState(false);
  // Radera-varning (2026-07-28, Zaidas önskemål: "få en varning vid radering
  // ifall den används för tillfället") — ett litet tvåstegs-kort istället för
  // en direkt radering, bara när mallen faktiskt har en aktiv occurrence.
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id | null>(null);
  // Sortering + filter (2026-07-29, Zaidas önskemål: "sortera uppgifterna
  // efter namn, starttid och sluttid... få fram alla uppgifter som tillhör
  // en familjemedlem, eller de som tillhör familjen"). "Egen ordning" är
  // default (den redan befintliga manuella dra-ordningen, oförändrad) — de
  // tre övriga lägena åsidosätter den tillfälligt (upp/ner-pilarna göms då,
  // eftersom en aktiv sortering och en manuell ordning annars motsäger
  // varandra visuellt).
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");

  // Strukturerad överblick, primärt i Zaidas egen manuella ordning (2026-07-28)
  // — mallar som saknas i `order` (t.ex. nyskapade) hamnar sist, i tidsordning
  // (tidigast startdatum, samma princip som tidigare).
  const unordered = [...getVisibleTodos(currentMember, roles, todos).filter(isRecurringTemplate)]
    .sort((a, b) => startTimeValue(a) - startTimeValue(b));
  const filtered = unordered.filter((t) => {
    if (memberFilter === "all") return true;
    if (memberFilter === "family") return !t.assignedTo;
    return t.assignedTo === memberFilter;
  });
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const templates = [...filtered].sort((a, b) => {
    if (sortMode === "name") return a.title.localeCompare(b.title, "sv");
    if (sortMode === "start") return startTimeValue(a) - startTimeValue(b);
    if (sortMode === "end") return endTimeValue(a) - endTimeValue(b);
    const ai = orderIndex.get(a.id);
    const bi = orderIndex.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
  const editingTodo = templates.find((t) => t.id === editingId) ?? null;
  const assignableMembers = members.filter((m) => m.deletedAt === null);

  // 2026-07-29, Zaidas önskemål: "i inställningar skall vi särskilja på
  // barnens uppgifter och övrigas" — två alltid synliga sektioner istället
  // för en enda blandad lista. Ett otilldelat (Familjen) eller vuxen-
  // tilldelat item räknas båda som "Övriga" (groupByChildAssignee, delad med
  // OneOffTodosSettings.tsx/TodoHistory.tsx).
  const { childItems, otherItems } = groupByChildAssignee(templates, members, roles);

  // Håll-och-dra istället för pil-för-pil (2026-07-29, Zaidas önskemål:
  // "flytta ordningen snabbt") — reorderGroup tar emot gruppens NYA ordning
  // (från useDragReorder) och skriver in den på just DE POSITIONER gruppens
  // id:n redan låg på i den FULLA ordningslistan (oavsett om de råkar ligga
  // intill varandra där), så en drag aldrig hoppar över till fel grupp.
  function reorderGroup(group: Todo[], newGroupOrder: Id[]) {
    const fullIds = templates.map((t) => t.id);
    const groupIdSet = new Set(group.map((t) => t.id));
    const positions: number[] = [];
    fullIds.forEach((id, i) => {
      if (groupIdSet.has(id)) positions.push(i);
    });
    const next = [...fullIds];
    newGroupOrder.forEach((id, i) => {
      next[positions[i]] = id;
    });
    onReorder(next);
  }

  const drag = useDragReorder<Id>("data-drag-key", "data-drag-group");

  // En mall "används just nu" om den har minst en ännu ej raderad,
  // väntande occurrence — samma relation som useTodosState.ts:s
  // softDeleteTodo redan cascade-raderar automatiskt vid radering. Varningen
  // är extra transparens ovanpå det (Zaida vill veta INNAN, inte bara att
  // det städas bort tyst).
  function activeOccurrenceCount(templateId: Id): number {
    return todos.filter((t) => t.recurringSourceId === templateId && t.deletedAt === null && t.status === "pending").length;
  }

  function requestDelete(id: Id) {
    if (activeOccurrenceCount(id) > 0) {
      setConfirmDeleteId(id);
      return;
    }
    onDeleteTodo(id);
  }

  function confirmDelete(id: Id) {
    setConfirmDeleteId(null);
    onDeleteTodo(id);
  }

  function renderRow(todo: Todo, group: Todo[], groupKey: string) {
    const endLabel = describeRecurrenceEnd(todo.recurrence);
    const groupIds = group.map((t) => t.id);
    return (
      <li
        className={`recurring-todos-settings__row${drag.dragOverKey === todo.id ? " recurring-todos-settings__row--drag-over" : ""}`}
        data-drag-group={groupKey}
        data-drag-key={todo.id}
        key={todo.id}
      >
        {sortMode === "manual" && (
          <button
            aria-label={`Flytta ${todo.title}`}
            className="icon-button recurring-todos-settings__drag-handle"
            onPointerDown={(e) => drag.handlePointerDown(e, todo.id, groupKey)}
            onPointerMove={drag.handlePointerMove}
            onPointerUp={() => drag.handlePointerUp(groupIds, (newOrder) => reorderGroup(group, newOrder))}
            type="button"
          >
            <GripVertical size={16} />
          </button>
        )}

        <div className="recurring-todos-settings__info">
          <strong>
            {todo.visual.value && <span aria-hidden="true">{todo.visual.value} </span>}
            {todo.title}
          </strong>
          <small>
            {getAssigneeName(todo, members)} · {describeRecurrence(todo.recurrence)}
            {todo.visibleFrom && ` · från ${isoToDateOnly(todo.visibleFrom)}`}
            {endLabel && ` · ${endLabel}`}
          </small>
        </div>

        {confirmDeleteId === todo.id ? (
          <div className="recurring-todos-settings__confirm">
            <small>
              Används just nu ({activeOccurrenceCount(todo.id)} väntande). Radera ändå?
            </small>
            <button
              aria-label={`Bekräfta radering av serien ${todo.title}`}
              className="icon-button danger"
              onClick={() => confirmDelete(todo.id)}
              type="button"
            >
              <Trash2 size={16} />
            </button>
            <button
              aria-label="Avbryt radering"
              className="icon-button"
              onClick={() => setConfirmDeleteId(null)}
              type="button"
            >
              Avbryt
            </button>
          </div>
        ) : (
          <>
            <button
              aria-label={`Redigera ${todo.title}`}
              className="icon-button"
              onClick={() => setEditingId(todo.id)}
              title="Redigera"
              type="button"
            >
              <Pencil size={16} />
            </button>
            <button
              aria-label={`Ta bort serien ${todo.title}`}
              className="icon-button danger"
              onClick={() => requestDelete(todo.id)}
              title="Ta bort serien"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </li>
    );
  }

  return (
    <>
      <div className="recurring-todos-settings__toolbar">
        <button className="secondary-button" onClick={() => setCreating(true)} type="button">
          <Plus size={16} /> Ny återkommande uppgift
        </button>
        <label className="recurring-todos-settings__toolbar-field">
          Sortera
          <select
            className="text-input"
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            value={sortMode}
          >
            <option value="manual">Egen ordning</option>
            <option value="name">Namn</option>
            <option value="start">Starttid</option>
            <option value="end">Sluttid</option>
          </select>
        </label>
        <label className="recurring-todos-settings__toolbar-field">
          Visa
          <select
            className="text-input"
            onChange={(e) => setMemberFilter(e.target.value as MemberFilter)}
            value={memberFilter}
          >
            <option value="all">Alla</option>
            <option value="family">Familjen (otilldelade)</option>
            {assignableMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {templates.length === 0 ? (
        <p className="empty-note">
          {unordered.length === 0 ? "Inga återkommande uppgifter ännu." : "Inga uppgifter matchar det valda filtret."}
        </p>
      ) : (
        <div className="recurring-todos-settings__groups">
          {childItems.length > 0 && (
            <div>
              <h4 className="recurring-todos-settings__group-heading">👶 Barn</h4>
              <ul className="recurring-todos-settings__list">{childItems.map((todo) => renderRow(todo, childItems, "child"))}</ul>
            </div>
          )}
          {otherItems.length > 0 && (
            <div>
              <h4 className="recurring-todos-settings__group-heading">Övriga</h4>
              <ul className="recurring-todos-settings__list">{otherItems.map((todo) => renderRow(todo, otherItems, "other"))}</ul>
            </div>
          )}
        </div>
      )}

      {editingTodo && (
        <TodoEditModal
          currentMember={currentMember}
          members={members}
          roles={roles}
          categories={categories}
          todos={todos}
          onCreateCategory={onCreateCategory}
          onCreateTaskTemplate={onCreateTaskTemplate}
          onDeleteTodo={onDeleteTodo}
          onRefreshRoutine={onRefreshRoutine}
          onClose={() => setEditingId(null)}
          onUpdateTodo={onUpdateTodo}
          todo={editingTodo}
          fixedTodoTimes={fixedTodoTimes}
        />
      )}

      {creating && (
        <TodoCreatorModal
          currentMember={currentMember}
          members={members}
          roles={roles}
          categories={categories}
          onCreateCategory={onCreateCategory}
          onCreateTodo={onCreateTodo}
          taskTemplates={taskTemplates}
          categoryTemplates={categoryTemplates}
          onClose={() => setCreating(false)}
          fixedTodoTimes={fixedTodoTimes}
        />
      )}
    </>
  );
}
