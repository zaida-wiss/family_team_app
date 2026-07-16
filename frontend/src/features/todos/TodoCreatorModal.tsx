import "./TodoCreatorModal.css";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { suggestEmojiForTitle } from "../../components/emojiData";
import { useModalA11y } from "../../hooks/useModalA11y";
import { generateId } from "../../utils/uuid";
import { isRecurrenceIncomplete, RecurrencePicker } from "./RecurrencePicker";
import { TimeWindowsPicker } from "./TimeWindowsPicker";
import { dateOnlyToISO } from "./recurringTodos";
import { isChildMember } from "./selectors";
import type { Id, Member, RecurrenceRule, Role, Todo, TodoCategory, TodoCategoryTemplate, TodoSubtask, TodoTemplate, TodoTimeWindow } from "@shared/types";

const DEFAULT_EMOJI = "⭐";

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
  // Mallbibliotek (2026-07-08) — "Hämta från mall" fyller i formuläret (en
  // enskild uppgift) eller skapar en HEL kategori med flera uppgifter på en
  // gång (en kategori-mall), se applyTaskTemplate/submitCategoryFromTemplate.
  taskTemplates: TodoTemplate[];
  categoryTemplates: TodoCategoryTemplate[];
  onClose: () => void;
  fixedTodoTimes?: boolean;
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
  taskTemplates,
  categoryTemplates,
  onClose,
  fixedTodoTimes = false
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  // Alla andra familjemedlemmar (2026-07-08-fix, Zaidas fynd: "jag kan inte
  // tilldela familjemedlemmar todo-uppgifter") — var tidigare filtrerat till
  // BARA barn (variabeln hette assignableChildren), vilket gjorde det omöjligt
  // att tilldela en uppgift åt en annan vuxen (t.ex. en medförälder), och
  // gjorde att hela "Åt vem?"-väljaren försvann helt om kontot råkade sakna
  // barn. isChildMember avgörs nu per vald mottagare (se isRecipientChild
  // nedan) istället för att antas utifrån "inte jag själv".
  const assignableMembers = useMemo(
    () => members.filter((m) => m.deletedAt === null && m.id !== currentMember.id),
    [members, currentMember.id]
  );

  function isRecipientChild(id: string): boolean {
    if (id === SELF_VALUE) return false;
    return isChildMember(members.find((m) => m.id === id), roles);
  }

  // Flera mottagare samtidigt (2026-07-06, Zaidas önskemål) — varje vald
  // familjemedlem får en egen kopia av uppgiften (samma mönster som
  // CSV-importen redan använder: en rad/todo per mottagare, inte en delad
  // todo med flera tilldelade).
  const [assigneeIds, setAssigneeIds] = useState<string[]>([SELF_VALUE]);
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  // Sant så fort användaren själv öppnat väljaren och valt något (även "Ingen
  // ikon") — stänger av den automatiska rekommendationen nedan permanent för
  // denna uppgift, så den inte skriver över ett medvetet val.
  const [emojiTouched, setEmojiTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    defaultCategoryId ?? categories[0]?.id ?? NO_CATEGORY_VALUE
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  // Ny kategori: tom eller från en kategori-mall (2026-07-08, Zaidas
  // önskemål: "antingen trycker jag på skapa en ny kategori och då kan jag
  // välja om det skall vara en egen eller från en från mallarna").
  const [createCategoryMode, setCreateCategoryMode] = useState<"empty" | "template">("empty");
  const [selectedCategoryTemplateId, setSelectedCategoryTemplateId] = useState("");
  const [categoryTemplateStartDate, setCategoryTemplateStartDate] = useState("");
  // Sträng, inte tal (2026-07-07-fix, Zaidas fynd) — annars tvingar
  // Number(e.target.value) fältet till "0" så fort man raderar för att skriva
  // ett nytt värde, vilket gjorde det omöjligt att byta ut talet (en envis
  // nolla stod kvar först). Tolkas till ett tal bara vid spara, se starValue.
  const [starValueInput, setStarValueInput] = useState("0");
  const starValue = Math.max(0, Math.floor(Number(starValueInput)) || 0);
  const [recurrence, setRecurrence] = useState<RecurrenceRule>({ type: "none" });
  const [visibleFrom, setVisibleFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [startDate, setStartDate] = useState("");
  const [timeWindows, setTimeWindows] = useState<TodoTimeWindow[]>([
    { visibleFrom: null, expiresAt: null }
  ]);
  const [notes, setNotes] = useState("");
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>([]);
  // Timerfunktion (2026-07-07, Zaidas önskemål: "hur lång tid det tar att
  // göra todo", precis som Medaljer/Rekord — men ett helt separat, enklare
  // system, se Todo.timerEnabled-kommentaren i shared/types.ts).
  const [timerEnabled, setTimerEnabled] = useState(false);
  // Planerad tid i minuter (2026-07-07, Zaidas förtydligande: en NEDRÄKNING,
  // inte en tidtagning) — samma sträng-baserade mönster som starValueInput
  // (undviker den redan kända "envis nolla vid tömning"-buggen).
  const [plannedDurationMinutesInput, setPlannedDurationMinutesInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isForChild = assigneeIds.some(isRecipientChild);

  // Rekommenderad ikon åt barnet (2026-07-08, Zaidas önskemål) — föreslår en
  // passande emoji utifrån titeln så fort minst ett barn är valt, så länge
  // ingen själv aktivt valt en ikon än. Uppdateras löpande medan titeln
  // skrivs, slutar helt så fort emojiTouched blir sant.
  useEffect(() => {
    if (!isForChild || emojiTouched) return;
    const suggestion = suggestEmojiForTitle(title);
    if (suggestion) setEmoji(suggestion);
  }, [title, isForChild, emojiTouched]);

  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_VALUE;
  const isCategoryFromTemplate = isCreatingCategory && createCategoryMode === "template";
  const isTitleMissing = title.trim().length === 0;
  // Utan ett startdatum blir visibleFrom null för en återkommande mall, vilket
  // gör att förfallo-beräkningen (recurringTodos.ts) tappar sitt ankardatum —
  // samma grundorsak som produktionsincidenten 2026-07-06 (se
  // incidents/2026-07-06-barnens-rutiner-forsvann.md). Spärras därför här.
  const isStartDateMissing = recurrence.type !== "none" && !startDate;
  // Försvinner tidigare än Syns från vore ett ogiltigt fönster (uppgiften
  // skulle aldrig synas) — spärras här (2026-07-07, Zaidas fynd).
  const isEndBeforeStart =
    recurrence.type === "none" && !!visibleFrom && !!expiresAt && expiresAt < visibleFrom;
  const canSubmit = isCategoryFromTemplate
    ? Boolean(selectedCategoryTemplateId && categoryTemplateStartDate)
    : !isTitleMissing &&
      !isStartDateMissing &&
      !isEndBeforeStart &&
      assigneeIds.length > 0 &&
      !isRecurrenceIncomplete(recurrence);

  // Försvinner förifylls med samma värde som Syns från (2026-07-07, Zaidas
  // önskemål) — så man inte behöver fylla i det två gånger, och för att
  // förhindra att det annars tomma/omedvetet kvarlämnade fältet råkar bli
  // tidigare än startdatumet. Bara ett förslag: skriver inte över ett värde
  // användaren redan aktivt valt i Försvinner.
  function handleVisibleFromChange(value: string) {
    setVisibleFrom(value);
    if (!expiresAt) {
      setExpiresAt(value);
    }
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        // Minst en mottagare måste alltid vara vald.
        return next.length > 0 ? next : prev;
      }
      return [...prev, id];
    });
  }

  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: generateId(), title: "", done: false }]);
  }

  function updateSubtaskTitle(id: Id, title: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function removeSubtask(id: Id) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  // Flytta ett delmoment upp/ner i listan (2026-07-08, Zaidas önskemål:
  // "jag behöver kunna flytta ordningen på delmomenten") — enkla pil-knappar
  // istället för drag-and-drop, samma touch-/tangentbordsvänliga mönster som
  // resten av appen använder för listor med få rader.
  function moveSubtask(id: Id, direction: -1 | 1) {
    setSubtasks((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  // Mallbibliotek: fyller i formuläret utifrån en enskild uppgiftsmall
  // (2026-07-08, Zaidas önskemål: "välja en uppgift från mallarna") — bara
  // ett förslag, fortsatt fritt att justera innan Skapa.
  function applyTaskTemplate(template: TodoTemplate) {
    setTitle(template.title);
    setEmoji(template.visual.value);
    setEmojiTouched(true);
    setRecurrence(template.recurrence);
    setStarValueInput(String(template.starValue));
    setSubtasks(template.subtasks.map((s) => ({ id: generateId(), title: s.title, done: false })));
  }

  // Mallbibliotek: skapar en HEL kategori i ett svep utifrån en kategori-mall
  // (2026-07-08, Zaidas önskemål: "hämta från mall och då kommer en kopia
  // igen") — en todo per mall-uppgift, tilldelade mig själv (personliga
  // kategorier är alltid mina, se ADR-0019/ADR-0020).
  async function submitCategoryFromTemplate() {
    const template = categoryTemplates.find((t) => t.id === selectedCategoryTemplateId);
    if (!template || !categoryTemplateStartDate) return;
    const category = await onCreateCategory(template.name);
    for (const task of template.tasks) {
      onCreateTodo({
        id: `todo-${generateId()}`,
        title: task.title,
        createdBy: currentMember.id,
        assignedTo: currentMember.id,
        isShared: false,
        status: "pending",
        starValue: task.starValue,
        visual: task.visual,
        recurrence: task.recurrence,
        recurringSourceId: null,
        occurrenceDate: null,
        visibleFrom: dateOnlyToISO(categoryTemplateStartDate),
        expiresAt: null,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null,
        deletedAt: null,
        deletedBy: null,
        personalCategoryId: category.id,
        notes: null,
        subtasks: task.subtasks.map((s) => ({ id: generateId(), title: s.title, done: false })),
        timerEnabled: false,
        plannedDurationMinutes: null,
        elapsedMs: null
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (submitting || !canSubmit) return;

    setSubmitting(true);
    try {
      if (isCategoryFromTemplate) {
        await submitCategoryFromTemplate();
        onClose();
        return;
      }

      let categoryId: Id | null = selectedCategoryId === NO_CATEGORY_VALUE ? null : selectedCategoryId;
      if (isCreatingCategory) {
        const trimmedName = newCategoryName.trim();
        if (!trimmedName) return;
        const category = await onCreateCategory(trimmedName);
        categoryId = category.id;
      }

      const isRecurring = recurrence.type !== "none";
      const cleanedSubtasks = subtasks
        .map((s) => ({ ...s, title: s.title.trim() }))
        .filter((s) => s.title.length > 0);

      // En kopia av uppgiften per vald mottagare (samma mönster som
      // CSV-importen) — varje familjemedlem (eller jag själv) får sin egen
      // todo med eget id/status, inte en delad uppgift med flera tilldelade.
      for (const recipientId of assigneeIds) {
        const isChildRecipient = isRecipientChild(recipientId);
        onCreateTodo({
          id: `todo-${generateId()}`,
          title: trimmedTitle,
          createdBy: currentMember.id,
          assignedTo: recipientId === SELF_VALUE ? currentMember.id : recipientId,
          isShared: false,
          status: "pending",
          starValue: isChildRecipient ? starValue : 0,
          visual: { type: "lucide-icon", value: emoji },
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
          notes: notes.trim() || null,
          subtasks: cleanedSubtasks.map((s) => ({ ...s, id: generateId() })),
          timerEnabled: isChildRecipient ? timerEnabled : false,
          plannedDurationMinutes:
            isChildRecipient && timerEnabled && plannedDurationMinutesInput
              ? Math.max(1, Math.min(480, Math.floor(Number(plannedDurationMinutesInput)) || 1))
              : null,
          elapsedMs: null
        });
      }
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
          {!isCategoryFromTemplate && assignableMembers.length > 0 && (
            <div className="field-label">
              <span>Åt vem? (går att välja flera)</span>
              <div aria-label="Åt vem?" className="todo-assignee-picker" role="group">
                <button
                  aria-pressed={assigneeIds.includes(SELF_VALUE)}
                  className={
                    "todo-assignee-picker__btn" +
                    (assigneeIds.includes(SELF_VALUE) ? " todo-assignee-picker__btn--on" : "")
                  }
                  onClick={() => toggleAssignee(SELF_VALUE)}
                  type="button"
                >
                  Mig själv
                </button>
                {assignableMembers.map((member) => (
                  <button
                    aria-pressed={assigneeIds.includes(member.id)}
                    className={
                      "todo-assignee-picker__btn" +
                      (assigneeIds.includes(member.id) ? " todo-assignee-picker__btn--on" : "")
                    }
                    key={member.id}
                    onClick={() => toggleAssignee(member.id)}
                    type="button"
                  >
                    {member.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isCategoryFromTemplate && (
            <>
              {taskTemplates.length > 0 && (
                <label className="field-label">
                  Hämta från mall
                  <select
                    className="text-input"
                    onChange={(e) => {
                      const found = taskTemplates.find((t) => t.id === e.target.value);
                      if (found) applyTaskTemplate(found);
                      e.target.value = "";
                    }}
                    value=""
                  >
                    <option value="" disabled>Välj en mall…</option>
                    {taskTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="todo-emoji-title-row">
                <EmojiPickerPortal
                  symbol={emoji}
                  onSelect={(value) => {
                    setEmoji(value);
                    setEmojiTouched(true);
                  }}
                  triggerClassName="todo-emoji-btn"
                />
                <label className="field-label todo-emoji-title-row__title">
                  Titel
                  <input
                    autoFocus
                    className="text-input"
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Till exempel Handla mat"
                    value={title}
                  />
                </label>
              </div>
              {isTitleMissing && <p className="field-hint">Titel krävs.</p>}
            </>
          )}

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
            <>
              {categoryTemplates.length > 0 && (
                <div aria-label="Ny kategori: tom eller från mall" className="todo-assignee-picker" role="group">
                  <button
                    aria-pressed={createCategoryMode === "empty"}
                    className={
                      "todo-assignee-picker__btn" +
                      (createCategoryMode === "empty" ? " todo-assignee-picker__btn--on" : "")
                    }
                    onClick={() => setCreateCategoryMode("empty")}
                    type="button"
                  >
                    Tom kategori
                  </button>
                  <button
                    aria-pressed={createCategoryMode === "template"}
                    className={
                      "todo-assignee-picker__btn" +
                      (createCategoryMode === "template" ? " todo-assignee-picker__btn--on" : "")
                    }
                    onClick={() => setCreateCategoryMode("template")}
                    type="button"
                  >
                    Från mall
                  </button>
                </div>
              )}

              {createCategoryMode === "empty" ? (
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
              ) : (
                <>
                  <label className="field-label">
                    Mall
                    <select
                      className="text-input"
                      onChange={(e) => setSelectedCategoryTemplateId(e.target.value)}
                      value={selectedCategoryTemplateId}
                    >
                      <option value="" disabled>Välj en mall…</option>
                      {categoryTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.tasks.length} uppgifter)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Startdatum för uppgifterna
                    <input
                      className="text-input"
                      onChange={(e) => setCategoryTemplateStartDate(e.target.value)}
                      type="date"
                      value={categoryTemplateStartDate}
                    />
                  </label>
                </>
              )}
            </>
          )}

          {!isCategoryFromTemplate && (
            <>
              {isForChild && (
                <label className="field-label">
                  Stjärnor
                  <input
                    className="text-input"
                    min={0}
                    onChange={(e) => setStarValueInput(e.target.value)}
                    type="number"
                    value={starValueInput}
                  />
                </label>
              )}

              {isForChild && (
                <label className="todo-timer-toggle">
                  <input
                    checked={timerEnabled}
                    onChange={(e) => setTimerEnabled(e.target.checked)}
                    type="checkbox"
                  />
                  Använd en timer för uppgiften
                </label>
              )}

              {isForChild && timerEnabled && (
                <label className="field-label">
                  Planerad tid (minuter)
                  <input
                    className="text-input"
                    min={1}
                    max={480}
                    onChange={(e) => setPlannedDurationMinutesInput(e.target.value)}
                    placeholder="T.ex. 10"
                    type="number"
                    value={plannedDurationMinutesInput}
                  />
                  <span className="field-hint field-hint--neutral">
                    Barnet dubbelklickar för att starta nedräkningen. Lämnas det tomt visas en vanlig tidtagning
                    istället.
                  </span>
                </label>
              )}

              <RecurrencePicker onChange={setRecurrence} value={recurrence} />

              {recurrence.type === "none" ? (
                <>
                  <label className="field-label">
                    Syns från
                    <input
                      className="text-input"
                      onChange={(e) => handleVisibleFromChange(e.target.value)}
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
                  {isEndBeforeStart && <p className="field-hint">Försvinner kan inte vara tidigare än Syns från.</p>}
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
                  {isStartDateMissing && <p className="field-hint">Välj ett startdatum.</p>}

                  <TimeWindowsPicker fixedTodoTimes={fixedTodoTimes} onChange={setTimeWindows} windows={timeWindows} />
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

              <div className="field-label">
                <span>Delmoment (egen checklista)</span>
                <ul className="todo-edit-modal__subtasks">
                  {subtasks.map((subtask, index) => (
                    <li key={subtask.id} className="todo-edit-modal__subtask-row">
                      <input
                        aria-label="Delmomentets titel"
                        className="text-input"
                        onChange={(e) => updateSubtaskTitle(subtask.id, e.target.value)}
                        placeholder="Till exempel Uppvärmning"
                        value={subtask.title}
                      />
                      <button
                        aria-label="Flytta delmoment upp"
                        className="icon-button"
                        disabled={index === 0}
                        onClick={() => moveSubtask(subtask.id, -1)}
                        type="button"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        aria-label="Flytta delmoment ner"
                        className="icon-button"
                        disabled={index === subtasks.length - 1}
                        onClick={() => moveSubtask(subtask.id, 1)}
                        type="button"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        aria-label="Ta bort delmoment"
                        className="icon-button"
                        onClick={() => removeSubtask(subtask.id)}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="secondary-button" onClick={addSubtask} type="button">
                  <Plus size={14} />
                  Lägg till delmoment
                </button>
              </div>
            </>
          )}

          <button className="primary-button" disabled={submitting || !canSubmit} type="submit">
            Skapa
          </button>
        </form>
      </div>
    </div>
  );
}
