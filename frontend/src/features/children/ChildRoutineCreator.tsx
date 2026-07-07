import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import type { Id, Member, Role, Todo, TodoCategory, Weekday } from "@shared/types";
import { hasPermission } from "../../utils/permissions";
import { generateId } from "../../utils/uuid";
import { RoutineList } from "./RoutineList";
import { applyTemplateToOccurrence, getDateKey } from "../todos/recurringTodos";
import {
  STAR_PRESETS,
  WEEKDAYS,
  findExistingRoutines,
  groupRoutines,
  isoToTimeInput,
  timeToAnchorISO,
  type RoutineGroup,
} from "./routineHelpers";
import "./ChildRoutineCreator.css";

const NO_CATEGORY_VALUE = "__none__";
const NEW_CATEGORY_VALUE = "__new__";

type Props = {
  currentMember: Member;
  children: Member[];
  roles: Role[];
  todos: Todo[];
  categories: TodoCategory[];
  onCreateCategory: (name: string) => Promise<TodoCategory>;
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
  categories,
  onCreateCategory,
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
  // Egen kategori (2026-07-08, ADR-0020, Zaidas beslut: "kategorierna kan
  // vara samma, vi behöver ingen rutinkategori, det räcker med kategori")
  // — ersätter det tidigare fasta Hälsa/Trivsel/Pengar-valet. Samma
  // kontobreda kategorilista som vuxenvyns tråd-vy, föräldern skapar/väljer
  // åt barnet.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(NO_CATEGORY_VALUE);
  const [newCategoryName, setNewCategoryName] = useState("");
  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_VALUE;
  const [selectedChildIds, setSelectedChildIds] = useState<Id[]>(() =>
    children.length === 1 ? [children[0].id] : []
  );
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [days, setDays] = useState<Weekday[]>([
    "monday", "tuesday", "wednesday", "thursday", "friday",
  ]);
  const [editingRoutineIds, setEditingRoutineIds] = useState<Id[]>([]);

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
  const existingRoutines = findExistingRoutines(todos, childIds);
  const routineGroups = groupRoutines(existingRoutines, children);

  function resetForm() {
    setTitle("");
    setEmoji("⭐");
    setStarsRaw("2");
    setSelectedCategoryId(NO_CATEGORY_VALUE);
    setNewCategoryName("");
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

  function createRoutineForChild(childId: Id, trimmedTitle: string, categoryId: Id | null) {
    onCreateTodo({
      id: `routine-${generateId()}` as Id,
      title: trimmedTitle,
      createdBy: currentMember.id,
      assignedTo: childId,
      isShared: false,
      status: "pending",
      starValue: stars,
      visual: { type: "lucide-icon", value: emoji },
      recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: days },
      recurringSourceId: null,
      occurrenceDate: null,
      visibleFrom: timeToAnchorISO(startTime),
      expiresAt: timeToAnchorISO(endTime),
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectedReason: null,
      deletedAt: null,
      deletedBy: null,
      personalCategoryId: categoryId,
    });
  }

  async function submit() {
    const t = title.trim();
    if (!t || selectedChildIds.length === 0 || days.length === 0) return;

    // Egen kategori (2026-07-08, ADR-0020) — skapar en ny kategori vid behov,
    // en gång, innan den återanvänds för alla valda barn.
    let categoryId: Id | null = selectedCategoryId === NO_CATEGORY_VALUE ? null : selectedCategoryId;
    if (isCreatingCategory) {
      const trimmedName = newCategoryName.trim();
      if (!trimmedName) return;
      const created = await onCreateCategory(trimmedName);
      categoryId = created.id;
    }

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
      const templateFields = {
        title: t,
        starValue: stars,
        visual: { type: "lucide-icon" as const, value: emoji },
        personalCategoryId: categoryId,
        visibleFrom: timeToAnchorISO(startTime),
        expiresAt: timeToAnchorISO(endTime),
      };
      const patch: Partial<Todo> = {
        ...templateFields,
        recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: days },
      };
      const todayKey = getDateKey(new Date());

      for (const childId of selectedChildIds) {
        const existing = editedByChild.get(childId);
        if (existing) {
          onUpdateTodo(existing.id, { ...patch, assignedTo: childId });

          // Dagens redan skapade kopia av rutinen är en frusen ögonblicksbild —
          // synka den direkt så ändringen syns på dashboarden idag, inte först imorgon.
          // Redan avklarade/godkända kopior rörs inte (skulle retroaktivt ändra utdelade stjärnor).
          const todaysOccurrence = todos.find(
            (todo) =>
              todo.recurringSourceId === existing.id &&
              todo.occurrenceDate === todayKey &&
              todo.status === "pending"
          );
          if (todaysOccurrence) {
            onUpdateTodo(todaysOccurrence.id, applyTemplateToOccurrence(todaysOccurrence, templateFields));
          }
        } else {
          createRoutineForChild(childId, t, categoryId);
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
      createRoutineForChild(childId, t, categoryId);
    }

    resetForm();
  }

  function startEditingRoutine(group: RoutineGroup) {
    const todo = group.todos[0];
    setEditingRoutineIds(group.todos.map((routine) => routine.id));
    setEmoji(todo.visual.value);
    setTitle(todo.title);
    setStarsRaw(String(todo.starValue));
    setSelectedCategoryId(todo.personalCategoryId ?? NO_CATEGORY_VALUE);
    setSelectedChildIds(group.children.map((child) => child.id));
    setStartTime(isoToTimeInput(todo.visibleFrom));
    setEndTime(isoToTimeInput(todo.expiresAt));
    setDays(todo.recurrence.type === "recurring" ? todo.recurrence.daysOfWeek ?? [] : []);
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

      <RoutineList
        routineGroups={routineGroups}
        onEdit={startEditingRoutine}
        onRefresh={(group) => group.todos.forEach((routine) => onRefreshRoutine(routine.id))}
        onDelete={(group) => group.todos.forEach((routine) => onDeleteTodo(routine.id))}
      />

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

          {/* Egen kategori (2026-07-08, ADR-0020) */}
          <select
            className="rcr-select-native"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            aria-label="Kategori"
          >
            <option value={NO_CATEGORY_VALUE}>Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value={NEW_CATEGORY_VALUE}>+ Ny kategori…</option>
          </select>
          {isCreatingCategory && (
            <input
              autoFocus
              className="rcr-input"
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Namn på ny kategori"
              value={newCategoryName}
              aria-label="Namn på ny kategori"
            />
          )}
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
            onClick={() => void submit()}
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
