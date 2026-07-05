import "./TodoCreatorModal.css";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { generateId } from "../../utils/uuid";
import { isRecurrenceIncomplete, RecurrencePicker } from "./RecurrencePicker";
import { TimeWindowsPicker } from "./TimeWindowsPicker";
import { dateOnlyToISO } from "./recurringTodos";
import type { Id, Member, RecurrenceRule, Role, Todo, TodoCategory, TodoTimeWindow } from "@shared/types";

const NEW_CATEGORY_VALUE = "__new__";
const NO_CATEGORY_VALUE = "__none__";
const SELF_VALUE = "__self__";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  categories: TodoCategory[];
  // Förvald kategori (2026-07-05) — satt när modalen öppnas via "Lägg till
  // uppgift" i en kategoris meny i tråd-vyn, fortsatt ändringsbar här.
  defaultCategoryId?: Id | null;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onCreateTodo: (todo: Todo) => void;
  onClose: () => void;
};

function toDateTimeString(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

// Enad skapa-modal (2026-07-05, Zaidas beslut) — en enda liten plus-ikon
// ersätter både den gamla "Skapa todo"-knappen (barn-tilldelning) och den
// tidigare separata personliga skapa-modalen. Ett val högst upp ("Åt vem?")
// avgör om uppgiften blir personlig (tilldelas den inloggade vuxna, med en
// egen kategori) eller tilldelas ett barn — schema/återkommande/anteckningar
// är gemensamma fält oavsett vem uppgiften är för. Platsbesparande: fält som
// bara är relevanta för ett av valen (stjärnor, kategori-namn) visas bara när
// de faktiskt behövs.
export function TodoCreatorModal({
  currentMember,
  members,
  roles,
  categories,
  defaultCategoryId,
  onCreateCategory,
  onCreateTodo,
  onClose
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  const assignableChildren = useMemo(() => {
    const childRoleIds = new Set(roles.filter((r) => r.isChildRole).map((r) => r.id));
    return members.filter(
      (m) => m.deletedAt === null && (m.isChild || childRoleIds.has(m.roleId))
    );
  }, [members, roles]);

  const [assigneeId, setAssigneeId] = useState<string>(SELF_VALUE);
  const [title, setTitle] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    defaultCategoryId ?? categories[0]?.id ?? NO_CATEGORY_VALUE
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [starValue, setStarValue] = useState(1);
  const [recurrence, setRecurrence] = useState<RecurrenceRule>({ type: "none" });
  const [visibleFrom, setVisibleFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [startDate, setStartDate] = useState("");
  const [timeWindows, setTimeWindows] = useState<TodoTimeWindow[]>([
    { visibleFrom: null, expiresAt: null }
  ]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isForChild = assigneeId !== SELF_VALUE;
  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_VALUE;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting || isRecurrenceIncomplete(recurrence)) return;

    setSubmitting(true);
    try {
      let categoryId: Id | null = selectedCategoryId === NO_CATEGORY_VALUE ? null : selectedCategoryId;
      if (isCreatingCategory) {
        const trimmedName = newCategoryName.trim();
        if (!trimmedName) return;
        const category = await onCreateCategory(trimmedName);
        categoryId = category.id;
      }

      const isRecurring = recurrence.type !== "none";
      onCreateTodo({
        id: `todo-${generateId()}`,
        title: trimmedTitle,
        createdBy: currentMember.id,
        assignedTo: isForChild ? assigneeId : currentMember.id,
        isShared: false,
        status: "pending",
        starValue: isForChild ? starValue : 0,
        visual: { type: "lucide-icon", value: "Star" },
        recurrence,
        recurringSourceId: null,
        occurrenceDate: null,
        // Återkommande: visibleFrom är bara ankardatumet för förfallo-
        // beräkningen, de faktiska klockslagen kommer från timeWindows.
        visibleFrom: isRecurring ? dateOnlyToISO(startDate) : toDateTimeString(visibleFrom),
        expiresAt: isRecurring ? null : toDateTimeString(expiresAt),
        timeWindows: isRecurring ? timeWindows : undefined,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null,
        deletedAt: null,
        deletedBy: null,
        personalCategoryId: categoryId,
        notes: notes.trim() || null
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="todo-creator-overlay" onClick={onClose}>
      <div
        aria-labelledby="todo-creator-title"
        aria-modal="true"
        className="todo-creator-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="todo-creator-modal__hdr">
          <span id="todo-creator-title">Ny uppgift</span>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>
        <form className="todo-creator-modal__body" onSubmit={handleSubmit}>
          {assignableChildren.length > 0 && (
            <label className="field-label">
              Åt vem?
              <select
                className="text-input"
                onChange={(e) => setAssigneeId(e.target.value)}
                value={assigneeId}
              >
                <option value={SELF_VALUE}>Mig själv</option>
                {assignableChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field-label">
            Titel
            <input
              autoFocus
              className="text-input"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Till exempel Handla mat"
              value={title}
            />
          </label>

          <label className="field-label">
            Kategori
            <select
              className="text-input"
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              value={selectedCategoryId}
            >
              <option value={NO_CATEGORY_VALUE}>Ingen kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>+ Ny kategori…</option>
            </select>
          </label>

          {isCreatingCategory && (
            <label className="field-label">
              Namn på ny kategori
              <input
                autoFocus
                className="text-input"
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Till exempel Träning"
                value={newCategoryName}
              />
            </label>
          )}

          {isForChild && (
            <label className="field-label">
              Stjärnor
              <input
                className="text-input"
                min={0}
                onChange={(e) => setStarValue(Number(e.target.value))}
                type="number"
                value={starValue}
              />
            </label>
          )}

          <RecurrencePicker onChange={setRecurrence} value={recurrence} />

          {recurrence.type === "none" ? (
            <>
              <label className="field-label">
                Syns från
                <input
                  className="text-input"
                  onChange={(e) => setVisibleFrom(e.target.value)}
                  type="datetime-local"
                  value={visibleFrom}
                />
              </label>

              <label className="field-label">
                Försvinner
                <input
                  className="text-input"
                  onChange={(e) => setExpiresAt(e.target.value)}
                  type="datetime-local"
                  value={expiresAt}
                />
              </label>
            </>
          ) : (
            <>
              <label className="field-label">
                Startdatum
                <input
                  className="text-input"
                  onChange={(e) => setStartDate(e.target.value)}
                  type="date"
                  value={startDate}
                />
              </label>

              <TimeWindowsPicker onChange={setTimeWindows} windows={timeWindows} />
            </>
          )}

          <label className="field-label">
            Anteckningar
            <textarea
              className="text-input"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valfritt"
              rows={2}
              value={notes}
            />
          </label>

          <button className="primary-button" disabled={submitting || isRecurrenceIncomplete(recurrence)} type="submit">
            Skapa
          </button>
        </form>
      </div>
    </div>
  );
}
