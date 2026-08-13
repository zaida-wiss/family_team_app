import { useEffect, useState } from "react";
import { CheckCircle2, Pencil, Trash2, X, XCircle } from "lucide-react";
import type { Id, Member, Role, Todo, TodoCategory } from "@shared/types";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { canDeleteTodo, canEditTodo } from "../../utils/permissions";
import { fmtFullDate, fmtTime } from "../calendars/calendarHelpers";
import { isChildMember } from "./selectors";

export const FAMILY_VALUE = "__family__";
export const NO_CATEGORY_VALUE = "__none__";

export const STATUS_LABEL: Record<Todo["status"], string> = {
  pending: "Väntar",
  done: "Vill godkännas",
  approved: "Godkänd",
  rejected: "Nekad",
  expired: "Utgången"
};

function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateTimeLocalToISO(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

// En återkommande mall/occurrence skriver sina serie-fält (titel/kategori/
// mottagare/schema) via en helt egen mall-kontra-dag-uppdelning med
// ankrade datumberäkningar (se TodoEditModal.tsx:s seriesPatch/dayPatch och
// dess omfattande buggkommentarer, t.ex. withWallClockOnDate). Ett rått
// onUpdateTodo(todo.id, patch) härifrån hade kringgått den logiken helt och
// riskerat exakt de datakorruptions-buggar som redan dokumenterats där —
// därför är fälten nedan bara redigerbara inline för uppgifter UTAN
// återkommelse; en återkommande rad hänvisas till "Redigera i modal".
function isSimpleSchedule(todo: Todo): boolean {
  return todo.recurringSourceId === null && todo.recurrence.type === "none";
}

export function categoryName(categories: TodoCategory[], id: Id | null | undefined): string {
  if (id === null || id === undefined) return "Ingen kategori";
  return categories.find((c) => c.id === id)?.name ?? "Ingen kategori";
}

export function assigneeName(members: Member[], todo: Todo): string {
  if (todo.assignedTo === null) return "Familjen";
  return members.find((m) => m.id === todo.assignedTo)?.name ?? "Okänd";
}

export type RejectState = {
  activeId: Id | null;
  reason: string;
  onStart: (id: Id) => void;
  onChangeReason: (reason: string) => void;
  onConfirm: (id: Id) => void;
  onCancel: () => void;
};

type Props = {
  todo: Todo;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  categories: TodoCategory[];
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onDeleteTodo: (todoId: Id) => void | Promise<unknown>;
  onApproveTodo: (todoId: Id) => void;
  onEdit: (id: Id) => void;
  reject: RejectState;
};

// Egen radkomponent, inte en .map()-callback i föräldern (TodoTableSettings.tsx)
// — varje rad behöver sin egen lokala buffert-state för text-/datumfälten
// (skrivs bara till servern vid blur, inte per tangenttryckning), och Hookar
// kan inte användas inuti en map-callback.
export function TodoTableRow({
  todo,
  currentMember,
  members,
  roles,
  categories,
  onUpdateTodo,
  onDeleteTodo,
  onApproveTodo,
  onEdit,
  reject
}: Props) {
  const editable = canEditTodo(currentMember, roles, todo);
  const deletable = canDeleteTodo(currentMember, roles, todo);
  const simpleSchedule = isSimpleSchedule(todo);
  const assigneeMember = members.find((m) => m.id === todo.assignedTo);
  const isChildAssignee = isChildMember(assigneeMember, roles);

  const [titleDraft, setTitleDraft] = useState(todo.title);
  useEffect(() => setTitleDraft(todo.title), [todo.title]);
  const [startDraft, setStartDraft] = useState(() => isoToDateTimeLocal(todo.visibleFrom));
  useEffect(() => setStartDraft(isoToDateTimeLocal(todo.visibleFrom)), [todo.visibleFrom]);
  const [endDraft, setEndDraft] = useState(() => isoToDateTimeLocal(todo.expiresAt));
  useEffect(() => setEndDraft(isoToDateTimeLocal(todo.expiresAt)), [todo.expiresAt]);
  const [starsDraft, setStarsDraft] = useState(String(todo.starValue));
  useEffect(() => setStarsDraft(String(todo.starValue)), [todo.starValue]);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== todo.title) onUpdateTodo(todo.id, { title: trimmed });
    else setTitleDraft(todo.title);
  }
  function commitStart() {
    const iso = dateTimeLocalToISO(startDraft);
    if (iso !== todo.visibleFrom) onUpdateTodo(todo.id, { visibleFrom: iso });
  }
  function commitEnd() {
    const iso = dateTimeLocalToISO(endDraft);
    if (iso !== todo.expiresAt) onUpdateTodo(todo.id, { expiresAt: iso });
  }
  function commitStars() {
    const value = Math.max(0, Math.floor(Number(starsDraft)) || 0);
    if (value !== todo.starValue) onUpdateTodo(todo.id, { starValue: value });
    else setStarsDraft(String(value));
  }

  const categoryValue = todo.personalCategoryId ?? NO_CATEGORY_VALUE;
  const assigneeValue = todo.assignedTo ?? FAMILY_VALUE;
  // Samma isFamily===(assignedTo===null)-princip som TodoEditModal.tsx:s
  // familyScope-filter, fast avgjord per rad istället för en global scope
  // eftersom tabellen blandar personliga och familje-uppgifter.
  const rowCategories = categories.filter(
    (c) => Boolean(c.isFamily) === (todo.assignedTo === null) || c.id === categoryValue
  );

  return (
    <tr className="todo-table__row" data-todo-id={todo.id}>
      <td className="todo-table__cell todo-table__cell--icon">
        {editable && simpleSchedule ? (
          <EmojiPickerPortal
            onSelect={(emoji) => onUpdateTodo(todo.id, { visual: { type: "lucide-icon", value: emoji } })}
            symbol={todo.visual.value}
            triggerClassName="todo-emoji-btn"
          />
        ) : (
          <span aria-hidden="true">{todo.visual.value}</span>
        )}
      </td>
      <td className="todo-table__cell todo-table__cell--title">
        {editable && simpleSchedule ? (
          <input
            aria-label="Titel"
            className="text-input"
            onBlur={commitTitle}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            value={titleDraft}
          />
        ) : (
          <span>{todo.title}</span>
        )}
      </td>
      <td className="todo-table__cell">
        {editable && simpleSchedule ? (
          <select
            aria-label="Kategori"
            className="text-input"
            onChange={(e) =>
              onUpdateTodo(todo.id, {
                personalCategoryId: e.target.value === NO_CATEGORY_VALUE ? null : e.target.value
              })
            }
            value={categoryValue}
          >
            <option value={NO_CATEGORY_VALUE}>Ingen kategori</option>
            {rowCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          categoryName(categories, todo.personalCategoryId)
        )}
      </td>
      <td className="todo-table__cell">
        {editable && simpleSchedule ? (
          <select
            aria-label="Ansvarig"
            className="text-input"
            onChange={(e) =>
              onUpdateTodo(todo.id, { assignedTo: e.target.value === FAMILY_VALUE ? null : e.target.value })
            }
            value={assigneeValue}
          >
            <option value={FAMILY_VALUE}>Familjen</option>
            {members
              .filter((m) => m.deletedAt === null)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        ) : (
          assigneeName(members, todo)
        )}
      </td>
      <td className="todo-table__cell todo-table__cell--datetime">
        {editable && simpleSchedule ? (
          <input
            aria-label="Syns från"
            className="text-input"
            onBlur={commitStart}
            onChange={(e) => setStartDraft(e.target.value)}
            type="datetime-local"
            value={startDraft}
          />
        ) : todo.visibleFrom ? (
          `${fmtFullDate(todo.visibleFrom)} ${fmtTime(todo.visibleFrom)}`
        ) : (
          "—"
        )}
      </td>
      <td className="todo-table__cell todo-table__cell--datetime">
        {editable && simpleSchedule ? (
          <input
            aria-label="Försvinner"
            className="text-input"
            onBlur={commitEnd}
            onChange={(e) => setEndDraft(e.target.value)}
            type="datetime-local"
            value={endDraft}
          />
        ) : todo.expiresAt ? (
          `${fmtFullDate(todo.expiresAt)} ${fmtTime(todo.expiresAt)}`
        ) : (
          "—"
        )}
      </td>
      <td className="todo-table__cell todo-table__cell--stars">
        {!isChildAssignee ? (
          "—"
        ) : editable && simpleSchedule ? (
          <input
            aria-label="Stjärnor"
            className="text-input todo-table__stars-input"
            min={0}
            onBlur={commitStars}
            onChange={(e) => setStarsDraft(e.target.value)}
            type="number"
            value={starsDraft}
          />
        ) : (
          todo.starValue
        )}
      </td>
      <td className="todo-table__cell todo-table__cell--status">
        <span className={`todo-table__status-badge todo-table__status-badge--${todo.status}`}>
          {STATUS_LABEL[todo.status]}
        </span>
        {todo.status === "done" &&
          (reject.activeId === todo.id ? (
            <div className="todo-table__reject-form">
              <input
                aria-label="Anledning (valfritt)"
                autoFocus
                className="text-input"
                onChange={(e) => reject.onChangeReason(e.target.value)}
                placeholder="Anledning (valfritt)"
                value={reject.reason}
              />
              <button
                aria-label="Bekräfta nekande"
                className="icon-button danger"
                onClick={() => reject.onConfirm(todo.id)}
                type="button"
              >
                <XCircle size={16} />
              </button>
              <button aria-label="Avbryt" className="icon-button" onClick={reject.onCancel} type="button">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="todo-table__status-actions">
              <button
                aria-label={`Godkänn ${todo.title}`}
                className="icon-button"
                onClick={() => onApproveTodo(todo.id)}
                title="Godkänn"
                type="button"
              >
                <CheckCircle2 size={16} />
              </button>
              <button
                aria-label={`Neka ${todo.title}`}
                className="icon-button danger"
                onClick={() => reject.onStart(todo.id)}
                title="Neka"
                type="button"
              >
                <XCircle size={16} />
              </button>
            </div>
          ))}
      </td>
      <td className="todo-table__cell todo-table__cell--details">
        {!simpleSchedule && <span title="Återkommande uppgift">🔁</span>}
        {(todo.subtasks?.length ?? 0) > 0 && (
          <span title="Delmoment">
            📝 {todo.subtasks!.filter((s) => s.done).length}/{todo.subtasks!.length}
          </span>
        )}
        {todo.timerEnabled && <span title="Timer">⏱</span>}
        {todo.notes && <span title="Anteckning finns">🗒️</span>}
      </td>
      <td className="todo-table__cell todo-table__cell--actions">
        <button
          aria-label={`Redigera ${todo.title} i modal`}
          className="icon-button"
          onClick={() => onEdit(todo.id)}
          title="Redigera i modal"
          type="button"
        >
          <Pencil size={16} />
        </button>
        {deletable && (
          <button
            aria-label={`Ta bort ${todo.title}`}
            className="icon-button danger"
            onClick={() => onDeleteTodo(todo.id)}
            title="Ta bort"
            type="button"
          >
            <Trash2 size={16} />
          </button>
        )}
      </td>
    </tr>
  );
}
