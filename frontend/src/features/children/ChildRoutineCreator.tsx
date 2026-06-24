import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Id, Member, Role, Todo, Weekday } from "@shared/types";
import { hasPermission } from "../../utils/permissions";

const WEEKDAYS: { key: Weekday; short: string }[] = [
  { key: "monday",    short: "M" },
  { key: "tuesday",   short: "T" },
  { key: "wednesday", short: "O" },
  { key: "thursday",  short: "T" },
  { key: "friday",    short: "F" },
  { key: "saturday",  short: "L" },
  { key: "sunday",    short: "S" },
];

const CATEGORIES = ["Hälsa", "Trivsel", "Pengar"];

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

type Props = {
  currentMember: Member;
  children: Member[];
  roles: Role[];
  todos: Todo[];
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
  const [editingRoutineId, setEditingRoutineId] = useState<Id | null>(null);
  const [routinesOpen, setRoutinesOpen] = useState(false);

  // ── dropdown open states ─────────────────────────────────────
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [childMenuOpen, setChildMenuOpen] = useState(false);

  // ── refs for outside-click ───────────────────────────────────
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef  = useRef<HTMLDivElement>(null);
  const childMenuRef    = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!emojiOpen) return;
    function handler(e: MouseEvent) {
      if (
        emojiPickerRef.current?.contains(e.target as Node) ||
        emojiTriggerRef.current?.contains(e.target as Node)
      ) return;
      setEmojiOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiOpen]);

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

  function resetForm() {
    setTitle("");
    setEmoji("⭐");
    setStarsRaw("2");
    setCategory("");
    setStartTime("");
    setEndTime("");
    setDays(["monday", "tuesday", "wednesday", "thursday", "friday"]);
    setEditingRoutineId(null);
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

  function openEmojiPicker() {
    if (emojiTriggerRef.current) {
      const r = emojiTriggerRef.current.getBoundingClientRect();
      setPickerPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
    }
    setEmojiOpen((v) => !v);
  }

  const stars = Math.max(1, Math.min(99, parseInt(starsRaw, 10) || 1));

  function submit() {
    const t = title.trim();
    if (!t || selectedChildIds.length === 0 || days.length === 0) return;

    if (editingRoutineId) {
      onUpdateTodo(editingRoutineId, {
        title: t,
        assignedTo: selectedChildIds[0],
        starValue: stars,
        visual: { type: "lucide-icon", value: emoji },
        recurrence: { type: "weekly", daysOfWeek: days },
        visibleFrom: timeToAnchorISO(startTime),
        expiresAt: timeToAnchorISO(endTime),
        routineCategory: category || null,
      });
      resetForm();
      return;
    }

    for (const childId of selectedChildIds) {
      onCreateTodo({
        id: `routine-${crypto.randomUUID()}` as Id,
        title: t,
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

    resetForm();
  }

  function startEditingRoutine(todo: Todo) {
    setEditingRoutineId(todo.id);
    setEmoji(todo.visual.value);
    setTitle(todo.title);
    setStarsRaw(String(todo.starValue));
    setCategory(todo.routineCategory ?? "");
    setSelectedChildIds(todo.assignedTo ? [todo.assignedTo] : []);
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
      <h4 className="rcr-title">Rutiner</h4>

      {/* ── existing routines list ─────────────────────────── */}
      {existingRoutines.length > 0 && (
        <div className="rcr-list">
          <button
            className="rcr-list-toggle"
            type="button"
            onClick={() => setRoutinesOpen((open) => !open)}
            aria-expanded={routinesOpen}
          >
            <span>Inlagda rutiner</span>
            <small>{existingRoutines.length}</small>
            <ChevronDown size={12} />
          </button>
          {routinesOpen && (
            <div className="rcr-list-menu">
              {existingRoutines.map((t) => {
                const child = children.find((c) => c.id === t.assignedTo) ?? null;
                return (
                  <div key={t.id} className="rcr-list-row">
                    <span className="rcr-list-emoji">{t.visual.value}</span>
                    {child && <MemberAvatar member={child} size="small" />}
                    <span className="rcr-list-name">{t.title}</span>
                    {t.visibleFrom && (
                      <span className="rcr-list-time">
                        {fmtTime(t.visibleFrom)}
                        {t.expiresAt ? `–${fmtTime(t.expiresAt)}` : ""}
                      </span>
                    )}
                    <span className="rcr-list-stars">{t.starValue}★</span>
                    <button
                      className="rcr-list-action"
                      type="button"
                      onClick={() => startEditingRoutine(t)}
                      aria-label={`Redigera ${t.title}`}
                    >
                      <Pencil size={8} />
                    </button>
                    <button
                      className="rcr-list-action"
                      type="button"
                      onClick={() => onRefreshRoutine(t.id)}
                      aria-label={`Visa ${t.title} igen idag`}
                    >
                      <RefreshCw size={8} />
                    </button>
                    <button
                      className="rcr-list-action"
                      type="button"
                      onClick={() => onDeleteTodo(t.id)}
                      aria-label={`Ta bort ${t.title}`}
                    >
                      <Trash2 size={8} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── compact add form ───────────────────────────────── */}
      <div className="rcr-form">
        {/* Row 1: emoji | title | stars | children | category */}
        <div className="rcr-row">
          {/* Emoji picker trigger */}
          <button
            ref={emojiTriggerRef}
            className="rcr-emoji-btn"
            type="button"
            onClick={openEmojiPicker}
            aria-label="Välj emoji"
            title="Välj emoji"
          >
            {emoji}
          </button>

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
            {CATEGORIES.map((c) => (
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
            aria-label={editingRoutineId ? "Spara rutin" : "Lägg till rutin"}
          >
            {editingRoutineId ? <Check size={14} /> : <Plus size={14} />}
          </button>
          {editingRoutineId && (
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

      {/* Emoji picker portal */}
      {emojiOpen && createPortal(
        <div
          ref={emojiPickerRef}
          className="rcr-emoji-picker-portal"
          style={{ top: pickerPos.top, left: pickerPos.left }}
        >
          <EmojiPicker
            height={340}
            width={280}
            onEmojiClick={(data) => {
              setEmoji(data.emoji);
              setEmojiOpen(false);
            }}
            previewConfig={{ showPreview: false }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
