import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Id, Member, Role, Todo, Weekday } from "@shared/types";
import { ROUTINE_CATEGORIES } from "@shared/types";
import { hasPermission } from "../../utils/permissions";
import "./ChildRoutineCreator.css";

const WEEKDAYS: { key: Weekday; short: string }[] = [
  { key: "monday",    short: "M" },
  { key: "tuesday",   short: "T" },
  { key: "wednesday", short: "O" },
  { key: "thursday",  short: "T" },
  { key: "friday",    short: "F" },
  { key: "saturday",  short: "L" },
  { key: "sunday",    short: "S" },
];

const STAR_PRESETS = [1, 2, 3, 4, 5];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

function timeToAnchorISO(hhmm: string): string | null {
  if (!hhmm) return null;
  return new Date(`2000-01-01T${hhmm}:00`).toISOString();
}

function isoToTimeInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function recurrenceKey(todo: Todo): string {
  if (todo.recurrence.type === "weekly") {
    return `weekly:${[...todo.recurrence.daysOfWeek].sort().join(",")}`;
  }
  if (todo.recurrence.type === "interval") {
    return `interval:${todo.recurrence.every}:${todo.recurrence.unit}`;
  }
  return "none";
}

function routineGroupKey(todo: Todo): string {
  return [
    todo.title.trim().toLocaleLowerCase("sv"),
    todo.visual.type,
    todo.visual.value,
    String(todo.starValue),
    todo.visibleFrom ?? "",
    todo.expiresAt ?? "",
    todo.routineCategory ?? "",
    recurrenceKey(todo)
  ].join("|");
}

function getStartSortValue(todo: Todo): number {
  if (!todo.visibleFrom) return Number.POSITIVE_INFINITY;
  const date = new Date(todo.visibleFrom);
  return date.getHours() * 60 + date.getMinutes();
}

function getRoutineDays(todo: Todo): Weekday[] {
  return todo.recurrence.type === "weekly" ? todo.recurrence.daysOfWeek : [];
}

type RoutineGroup = {
  key: string;
  todos: Todo[];
  children: Member[];
};

type Props = {
  currentMember: Member;
  children: Member[];
  roles: Role[];
  todos: Todo[];
  showTitle?: boolean;
  onCreateTodo: (todo: Todo) => void;
  onUpdateTodo: (todoId: string, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: string) => void;
  onDeleteTodo: (todoId: string) => void;
};

export function ChildRoutineCreator({
  currentMember,
  children,
  roles,
  todos,
  showTitle = true,
  onCreateTodo,
  onUpdateTodo,
  onRefreshRoutine,
  onDeleteTodo,
}: Props) {
  const canCreate = hasPermission(currentMember, roles, "canScheduleRecurringTodos");

  // ── form state ──────────────────────────────────────────────
  const [emoji, setEmoji] = useState("⭐");
  const [title, setTitle] = useState("");
  const [starsRaw, setStarsRaw] = useState("2");
  const [category, setCategory] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState<Id[]>(() =>
    children.length === 1 ? [children[0].id] : []
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [days, setDays] = useState<Weekday[]>([
    "monday", "tuesday", "wednesday", "thursday", "friday",
  ]);
  const [editingRoutineIds, setEditingRoutineIds] = useState<Id[]>([]);
  const [routinesOpen, setRoutinesOpen] = useState(false);

  // ── dropdown open states ─────────────────────────────────────
  const [childMenuOpen, setChildMenuOpen] = useState(false);

  // ── refs for outside-click ───────────────────────────────────
  const childMenuRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!childMenuOpen) return;
    function handler(e: MouseEvent) {
      if (childMenuRef.current?.contains(e.target as Node)) return;
      setChildMenuOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [childMenuOpen]);

  if (!canCreate || children.length === 0) return null;

  // ── existing routines ────────────────────────────────────────
  const childIds = new Set(children.map((c) => c.id));
  const existingRoutines = todos.filter(
    (t) =>
      t.assignedTo !== null &&
      childIds.has(t.assignedTo) &&
      t.recurrence.type !== "none" &&
      t.recurringSourceId === null &&
      t.deletedAt === null
  );
  const routineGroups = [...existingRoutines.reduce((groups, routine) => {
    const key = routineGroupKey(routine);
    const group = groups.get(key) ?? { key, todos: [], children: [] };
    group.todos.push(routine);

    const child = children.find((c) => c.id === routine.assignedTo);
    if (child && !group.children.some((c) => c.id === child.id)) {
      group.children.push(child);
    }

    groups.set(key, group);
    return groups;
  }, new Map<string, RoutineGroup>()).values()].sort((a, b) => {
    const primary = getStartSortValue(a.todos[0]) - getStartSortValue(b.todos[0]);
    if (primary !== 0) return primary;
    return a.todos[0].title.localeCompare(b.todos[0].title, "sv");
  });

  function resetForm() {
    setTitle("");
    setEmoji("⭐");
    setStarsRaw("2");
    setCategory("");
    setStartTime("");
    setEndTime("");
    setDays(["monday", "tuesday", "wednesday", "thursday", "friday"]);
    setEditingRoutineIds([]);
    if (children.length > 1) setSelectedChildIds([]);
  }

  // ── helpers ──────────────────────────────────────────────────
  function toggleChild(id: Id) {
    setSelectedChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleDay(day: Weekday) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }



  const stars = Math.max(1, Math.min(99, parseInt(starsRaw, 10) || 1));

  function createRoutineForChild(childId: Id, trimmedTitle: string) {
    onCreateTodo({
      id: `routine-${crypto.randomUUID()}` as Id,
      title: trimmedTitle,
      createdBy: currentMember.id,
      assignedTo: childId,
      isShared: false,
      status: "pending",
      starValue: stars,
      visual: { type: "lucide-icon", value: emoji },
      recurrence: { type: "weekly", daysOfWeek: days },
      recurringSourceId: null,
      occurrenceDate: null,
      visibleFrom: timeToAnchorISO(startTime),
      expiresAt: timeToAnchorISO(endTime),
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      deletedAt: null,
      deletedBy: null,
      routineCategory: category || null,
    });
  }

  function submit() {
    const t = title.trim();
    if (!t || selectedChildIds.length === 0 || days.length === 0) return;

    if (editingRoutineIds.length > 0) {
      const editedRoutines = existingRoutines.filter((routine) =>
        editingRoutineIds.includes(routine.id)
      );
      const editedByChild = new Map(
        editedRoutines
          .filter((routine): routine is Todo & { assignedTo: Id } => routine.assignedTo !== null)
          .map((routine) => [routine.assignedTo, routine])
      );
      const selectedChildIdSet = new Set(selectedChildIds);
      const patch: Partial<Todo> = {
        title: t,
        starValue: stars,
        visual: { type: "lucide-icon", value: emoji },
        recurrence: { type: "weekly", daysOfWeek: days },
        visibleFrom: timeToAnchorISO(startTime),
        expiresAt: timeToAnchorISO(endTime),
        routineCategory: category || null,
      };

      for (const childId of selectedChildIds) {
        const existing = editedByChild.get(childId);
        if (existing) {
          onUpdateTodo(existing.id, { ...patch, assignedTo: childId });
        } else {
          createRoutineForChild(childId, t);
        }
      }

      for (const routine of editedRoutines) {
        if (routine.assignedTo && !selectedChildIdSet.has(routine.assignedTo)) {
          onDeleteTodo(routine.id);
        }
      }

      resetForm();
      return;
    }

    for (const childId of selectedChildIds) {
      createRoutineForChild(childId, t);
    }

    resetForm();
  }

  function startEditingRoutine(group: RoutineGroup) {
    const todo = group.todos[0];
    setEditingRoutineIds(group.todos.map((routine) => routine.id));
    setEmoji(todo.visual.value);
    setTitle(todo.title);
    setStarsRaw(String(todo.starValue));
    setCategory(todo.routineCategory ?? "");
    setSelectedChildIds(group.children.map((child) => child.id));
    setStartTime(isoToTimeInput(todo.visibleFrom));
    setEndTime(isoToTimeInput(todo.expiresAt));
    setDays(todo.recurrence.type === "weekly" ? todo.recurrence.daysOfWeek : []);
  }

  // ── child label ──────────────────────────────────────────────
  const childLabel =
    selectedChildIds.length === 0
      ? "Välj barn"
      : selectedChildIds.length === 1
      ? children.find((c) => c.id === selectedChildIds[0])?.name ?? "1 barn"
      : `${selectedChildIds.length} barn`;

  return (
    <div className="rcr">
      {showTitle && <h4 className="rcr-title">Rutiner</h4>}

      {/* ── existing routines list ─────────────────────────── */}
      {routineGroups.length > 0 && (
        <div className="rcr-list">
          <button
            className="rcr-list-toggle"
            type="button"
            onClick={() => setRoutinesOpen((open) => !open)}
            aria-expanded={routinesOpen}
          >
            <span>Inlagda rutiner</span>
            <small>{routineGroups.length}</small>
            <ChevronDown size={12} />
          </button>
          {routinesOpen && (
            <div className="rcr-list-menu">
              <table className="rcr-list-table" aria-label="Inlagda rutiner">
                <colgroup>
                  <col className="rcr-list-col-icon" />
                  <col className="rcr-list-col-time" />
                  <col className="rcr-list-col-title" />
                  <col className="rcr-list-col-days" />
                  <col className="rcr-list-col-children" />
                  <col className="rcr-list-col-value" />
                  <col className="rcr-list-col-action" />
                  <col className="rcr-list-col-refresh" />
                  <col className="rcr-list-col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Ikon</th>
                    <th scope="col">Tid</th>
                    <th scope="col">Titel</th>
                    <th scope="col">Veckodagar</th>
                    <th scope="col">Barn</th>
                    <th scope="col">Värde</th>
                    <th scope="col">Ändra</th>
                    <th scope="col">Refrecha</th>
                    <th scope="col">Deleta</th>
                  </tr>
                </thead>
                <tbody>
                  {routineGroups.map((group) => {
                    const t = group.todos[0];
                    return (
                      <tr key={group.key}>
                        <td className="rcr-list-icon">{t.visual.value}</td>
                        <td className="rcr-list-time">
                          {t.visibleFrom ? (
                            <>
                              {fmtTime(t.visibleFrom)}
                              {t.expiresAt ? (
                                <span className="rcr-list-time-end">–{fmtTime(t.expiresAt)}</span>
                              ) : null}
                            </>
                          ) : "--:--"}
                        </td>
                        <td className="rcr-list-name">
                          <span>{t.title}</span>
                        </td>
                        <td className="rcr-list-days" aria-label="Veckodagar">
                          {WEEKDAYS.map(({ key, short }) => {
                            const isActive = getRoutineDays(t).includes(key);
                            return (
                              <span
                                key={key}
                                className={`rcr-list-day${isActive ? " rcr-list-day--on" : ""}`}
                                aria-label={isActive ? `${short} har rutinen` : `${short} har inte rutinen`}
                                title={isActive ? "Rutin denna dag" : "Ingen rutin denna dag"}
                              >
                                {short}
                              </span>
                            );
                          })}
                        </td>
                        <td className="rcr-list-children">
                          <span className="rcr-list-child-icons">
                            {group.children.map((child) => (
                              <MemberAvatar key={child.id} member={child} size="xs" />
                            ))}
                          </span>
                        </td>
                        <td className="rcr-list-stars">{t.starValue}★</td>
                        <td className="rcr-list-action-cell">
                          <button
                            className="rcr-list-action"
                            type="button"
                            onClick={() => startEditingRoutine(group)}
                            aria-label={`Redigera ${t.title}`}
                          >
                            <Pencil size={8} />
                          </button>
                        </td>
                        <td className="rcr-list-action-cell">
                          <button
                            className="rcr-list-action"
                            type="button"
                            onClick={() => group.todos.forEach((routine) => onRefreshRoutine(routine.id))}
                            aria-label={`Visa ${t.title} igen idag`}
                          >
                            <RefreshCw size={8} />
                          </button>
                        </td>
                        <td className="rcr-list-action-cell">
                          <button
                            className="rcr-list-action"
                            type="button"
                            onClick={() => group.todos.forEach((routine) => onDeleteTodo(routine.id))}
                            aria-label={`Ta bort ${t.title}`}
                          >
                            <Trash2 size={8} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── compact add form ───────────────────────────────── */}
      <div className="rcr-form">
        {/* Row 1: emoji | title | stars | children | category */}
        <div className="rcr-row">
          {/* Emoji picker trigger */}
          <EmojiPickerPortal
            symbol={emoji}
            onSelect={setEmoji}
            triggerClassName="rcr-emoji-btn"
          />

          <input
            className="rcr-input rcr-input--title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Uppgiftens namn"
            aria-label="Titel"
          />

          {/* Stars: select preset OR type */}
          <div className="rcr-stars-wrap">
            <select
              className="rcr-select-native"
              value={STAR_PRESETS.includes(stars) ? String(stars) : "custom"}
              onChange={(e) => {
                if (e.target.value !== "custom") setStarsRaw(e.target.value);
              }}
              aria-label="Stjärnor (förvalt)"
            >
              {STAR_PRESETS.map((n) => (
                <option key={n} value={n}>{n}★</option>
              ))}
              <option value="custom">Annat</option>
            </select>
            {!STAR_PRESETS.includes(stars) && (
              <input
                type="number"
                className="rcr-stars-custom"
                min={1}
                max={99}
                value={starsRaw}
                onChange={(e) => setStarsRaw(e.target.value)}
                aria-label="Egna stjärnor"
              />
            )}
            {STAR_PRESETS.includes(stars) && (
              <input
                type="number"
                className="rcr-stars-custom rcr-stars-custom--hidden"
                min={1}
                max={99}
                value={starsRaw}
                onChange={(e) => setStarsRaw(e.target.value)}
                aria-label="Egna stjärnor"
                tabIndex={-1}
              />
            )}
          </div>

          {/* Children multi-select */}
          <div className="rcr-dropdown" ref={childMenuRef}>
            <button
              className="rcr-dropdown-trigger"
              type="button"
              onClick={() => setChildMenuOpen((v) => !v)}
              aria-expanded={childMenuOpen}
              aria-label="Välj barn"
            >
              <span>{childLabel}</span>
              <ChevronDown size={11} />
            </button>
            {childMenuOpen && (
              <div className="rcr-dropdown-menu">
                {children.map((child) => (
                  <label key={child.id} className="rcr-dropdown-option">
                    <input
                      type="checkbox"
                      checked={selectedChildIds.includes(child.id)}
                      onChange={() => toggleChild(child.id)}
                    />
                    <span>{child.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Category */}
          <select
            className="rcr-select-native"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Kategori"
          >
            <option value="">Kategori</option>
            {ROUTINE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Row 2: time range | days | add button */}
        <div className="rcr-row rcr-row--days">
          <input
            type="time"
            className="rcr-time-input"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            aria-label="Från kl."
            title="Synlig från"
          />
          <span className="rcr-time-sep">–</span>
          <input
            type="time"
            className="rcr-time-input"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            aria-label="Till kl."
            title="Synlig till"
          />

          <div className="rcr-days">
            {WEEKDAYS.map(({ key, short }) => (
              <button
                key={key}
                type="button"
                className={`rcr-day${days.includes(key) ? " rcr-day--on" : ""}`}
                onClick={() => toggleDay(key)}
                aria-pressed={days.includes(key)}
              >
                {short}
              </button>
            ))}
          </div>

          <button
            className="rcr-add-btn"
            type="button"
            onClick={submit}
            disabled={!title.trim() || selectedChildIds.length === 0 || days.length === 0}
            aria-label={editingRoutineIds.length > 0 ? "Spara rutin" : "Lägg till rutin"}
          >
            {editingRoutineIds.length > 0 ? <Check size={14} /> : <Plus size={14} />}
          </button>
          {editingRoutineIds.length > 0 && (
            <button
              className="rcr-add-btn rcr-add-btn--muted"
              type="button"
              onClick={resetForm}
              aria-label="Avbryt redigering"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
