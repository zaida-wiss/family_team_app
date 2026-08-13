import "./TodoTableSettings.css";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Id, Member, Role, Todo, TodoCategory, TodoTemplate, TodoTemplateTask } from "@shared/types";
import { getVisibleTodos } from "./selectors";
import { TodoEditModal } from "./TodoEditModal";
import {
  assigneeName,
  categoryName,
  FAMILY_VALUE,
  NO_CATEGORY_VALUE,
  STATUS_LABEL,
  TodoTableRow,
  type RejectState
} from "./TodoTableRow";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  categories: TodoCategory[];
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCreateCategory: (name: string, isFamily?: boolean) => Promise<TodoCategory>;
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onDeleteTodo: (todoId: Id) => void | Promise<unknown>;
  onRefreshRoutine: (routineId: Id, templatePatch?: Partial<Todo>) => void;
  onApproveTodo: (todoId: Id) => void;
  onRejectTodo: (todoId: Id, reason: string | null) => void;
};

const ALL_VALUE = "all";

type SortColumn = "title" | "category" | "assignee" | "start" | "end" | "stars" | "status";
type SortDirection = "asc" | "desc";
const STATUS_ORDER: Record<Todo["status"], number> = { pending: 0, done: 1, approved: 2, rejected: 3, expired: 4 };

type ColumnDef = { key: SortColumn; label: string };
const COLUMNS: ColumnDef[] = [
  { key: "title", label: "Titel" },
  { key: "category", label: "Kategori" },
  { key: "assignee", label: "Ansvarig" },
  { key: "start", label: "Start" },
  { key: "end", label: "Slut" },
  { key: "stars", label: "Stjärnor" },
  { key: "status", label: "Status" }
];

// Tabellvy för todos i Inställningar (2026-08-13, Zaidas önskemål: "filtrera
// och sortera för att snabbt och enkelt skapa ordning och struktur... och
// snabbt ändra... det ska självklart vara möjligt att även redigera via en
// modal"). Datakällan är samma getVisibleTodos som resten av Todo-listan i
// Inställningar redan använder (OneOffTodosSettings.tsx m.fl.) — ger
// naturligt hela familjens uppgifter till den som har canSeeAllTodos, annars
// bara egna/delade/familjens, utan någon ny behörighetstyp. Själva raden
// (inline-redigering, den återkommande-skrivskyddet) ligger i TodoTableRow.tsx
// — den här filen äger bara filter/sortering/tabellskalet.
export function TodoTableSettings({
  currentMember,
  members,
  roles,
  todos,
  categories,
  onUpdateTodo,
  onCreateCategory,
  onCreateTaskTemplate,
  onDeleteTodo,
  onRefreshRoutine,
  onApproveTodo,
  onRejectTodo
}: Props) {
  const [editingId, setEditingId] = useState<Id | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_VALUE);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL_VALUE);
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE);
  const [sortColumn, setSortColumn] = useState<SortColumn>("end");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [rejectingId, setRejectingId] = useState<Id | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const visibleTodos = getVisibleTodos(currentMember, roles, todos);
  const editingTodo = visibleTodos.find((t) => t.id === editingId) ?? null;
  const activeMembers = members.filter((m) => m.deletedAt === null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visibleTodos.filter((todo) => {
      if (term && !todo.title.toLowerCase().includes(term)) return false;
      if (categoryFilter !== ALL_VALUE) {
        const value = todo.personalCategoryId ?? NO_CATEGORY_VALUE;
        if (value !== categoryFilter) return false;
      }
      if (assigneeFilter !== ALL_VALUE) {
        const value = todo.assignedTo ?? FAMILY_VALUE;
        if (value !== assigneeFilter) return false;
      }
      if (statusFilter !== ALL_VALUE && todo.status !== statusFilter) return false;
      return true;
    });
  }, [visibleTodos, search, categoryFilter, assigneeFilter, statusFilter]);

  const sorted = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    const dateValue = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);
    return [...filtered].sort((a, b) => {
      switch (sortColumn) {
        case "title":
          return dir * a.title.localeCompare(b.title, "sv");
        case "category":
          return (
            dir *
            categoryName(categories, a.personalCategoryId).localeCompare(
              categoryName(categories, b.personalCategoryId),
              "sv"
            )
          );
        case "assignee":
          return dir * assigneeName(members, a).localeCompare(assigneeName(members, b), "sv");
        case "stars":
          return dir * (a.starValue - b.starValue);
        case "status":
          return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
        case "start":
          return dir * (dateValue(a.visibleFrom) - dateValue(b.visibleFrom));
        case "end":
        default:
          return dir * (dateValue(a.expiresAt) - dateValue(b.expiresAt));
      }
    });
  }, [filtered, sortColumn, sortDirection, categories, members]);

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function ariaSortFor(column: SortColumn): "ascending" | "descending" | "none" {
    if (sortColumn !== column) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  const reject: RejectState = {
    activeId: rejectingId,
    reason: rejectReason,
    onStart: (id) => {
      setRejectingId(id);
      setRejectReason("");
    },
    onChangeReason: setRejectReason,
    onConfirm: (id) => {
      onRejectTodo(id, rejectReason.trim() || null);
      setRejectingId(null);
      setRejectReason("");
    },
    onCancel: () => {
      setRejectingId(null);
      setRejectReason("");
    }
  };

  if (visibleTodos.length === 0) {
    return <p className="empty-note">Inga uppgifter ännu.</p>;
  }

  return (
    <>
      {/* Filtrens egna namn ("Filtrera på…") istället för bara "Kategori"/
          "Ansvarig" — annars krockar deras tillgängliga namn med varje rads
          egen inline-select (som bär samma korta aria-label), vilket gör
          dem omöjliga att särskilja för skärmläsare/testverktyg. */}
      <div className="todo-table__filters">
        <label className="field-label todo-table__filter">
          Sök i titel
          <input
            className="text-input"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Titel…"
            value={search}
          />
        </label>
        <label className="field-label todo-table__filter">
          Filtrera på kategori
          <select className="text-input" onChange={(e) => setCategoryFilter(e.target.value)} value={categoryFilter}>
            <option value={ALL_VALUE}>Alla</option>
            <option value={NO_CATEGORY_VALUE}>Ingen kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label todo-table__filter">
          Filtrera på ansvarig
          <select className="text-input" onChange={(e) => setAssigneeFilter(e.target.value)} value={assigneeFilter}>
            <option value={ALL_VALUE}>Alla</option>
            <option value={FAMILY_VALUE}>Familjen</option>
            {activeMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label todo-table__filter">
          Filtrera på status
          <select className="text-input" onChange={(e) => setStatusFilter(e.target.value)} value={statusFilter}>
            <option value={ALL_VALUE}>Alla</option>
            {(Object.keys(STATUS_LABEL) as Todo["status"][]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <p className="empty-note">Inga uppgifter matchar filtret.</p>
      ) : (
        <div className="todo-table__scroll">
          <table className="todo-table">
            <thead>
              <tr>
                <th aria-hidden="true" className="todo-table__cell--icon" scope="col" />
                {COLUMNS.map((col) => (
                  <th aria-sort={ariaSortFor(col.key)} key={col.key} scope="col">
                    <button className="todo-table__sort-btn" onClick={() => toggleSort(col.key)} type="button">
                      {col.label}
                      {sortColumn === col.key ? (
                        sortDirection === "asc" ? (
                          <ArrowUp aria-hidden="true" size={14} />
                        ) : (
                          <ArrowDown aria-hidden="true" size={14} />
                        )
                      ) : (
                        <ArrowUpDown aria-hidden="true" size={14} />
                      )}
                    </button>
                  </th>
                ))}
                <th scope="col">Detaljer</th>
                <th scope="col">
                  <span className="sr-only">Åtgärder</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((todo) => (
                <TodoTableRow
                  categories={categories}
                  currentMember={currentMember}
                  key={todo.id}
                  members={members}
                  onApproveTodo={onApproveTodo}
                  onDeleteTodo={onDeleteTodo}
                  onEdit={setEditingId}
                  onUpdateTodo={onUpdateTodo}
                  reject={reject}
                  roles={roles}
                  todo={todo}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingTodo && (
        <TodoEditModal
          categories={categories}
          currentMember={currentMember}
          members={members}
          onClose={() => setEditingId(null)}
          onCreateCategory={onCreateCategory}
          onCreateTaskTemplate={onCreateTaskTemplate}
          onDeleteTodo={onDeleteTodo}
          onRefreshRoutine={onRefreshRoutine}
          onUpdateTodo={onUpdateTodo}
          roles={roles}
          todo={editingTodo}
          todos={todos}
        />
      )}
    </>
  );
}
