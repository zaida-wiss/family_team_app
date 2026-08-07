import "./TodoDetailModal.css";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileStack, Plus, Trash2, X } from "lucide-react";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { useModalA11y } from "../../hooks/useModalA11y";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import { isRecurrenceIncomplete, RecurrencePicker } from "./RecurrencePicker";
import { TimeWindowsPicker } from "./TimeWindowsPicker";
import { dateOnlyToISO, isoToDateOnly } from "./recurringTodos";
import { isChildMember } from "./selectors";
import { SubtaskAssigneeButton } from "./SubtaskAssigneeButton";
import { generateId } from "../../utils/uuid";
import type { Id, Member, RecurrenceRule, Role, Todo, TodoCategory, TodoSubtask, TodoTemplate, TodoTemplateTask, TodoTimeWindow } from "@shared/types";

const NEW_CATEGORY_VALUE = "__new__";
const NO_CATEGORY_VALUE = "__none__";
const SELF_VALUE = "__self__";
// Familjen (2026-07-23) — se TodoCreatorModal.tsx.
const FAMILY_VALUE = "__family__";
// Autospara (2026-07-08, Zaidas önskemål: "jag vill inte behöva trycka på
// spara... det skall sparas ändå när jag skriver") — väntar ut en kort paus i
// skrivandet innan ändringen skickas, istället för att spara vid VARJE
// tangenttryckning.
const AUTOSAVE_DEBOUNCE_MS = 700;
const SAVED_INDICATOR_MS = 1500;

type Props = {
  todo: Todo;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  categories: TodoCategory[];
  // Behövs för att slå upp den återkommande mallen bakom en daglig occurrence
  // (todo.recurringSourceId) — se seriesSource nedan.
  todos: Todo[];
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCreateCategory: (name: string, isFamily?: boolean) => Promise<TodoCategory>;
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  // Returnerar numera möjligen ett promise (2026-08-06, Zaidas fynd:
  // "fortfarande problem med autentisering och behörighet att radera
  // todos") — den underliggande softDeleteTodo (useTodosState.ts) har sedan
  // 2026-08-05 en klientsidig canDeleteTodo-förkoll och returnerar
  // {ok:false} om anroparen inte får radera (skapad av någon annan, ingen
  // canDeleteAnyTodos) — men handleDelete här stängde modalen OVILLKORLIGT
  // direkt efter anropet, utan att någonsin läsa av resultatet. En nekad
  // radering såg då ut som att "ingenting händer"/"fungerar inte", utan
  // någon förklaring till varför.
  onDeleteTodo: (todoId: Id) => void | Promise<unknown>;
  // Synkar dagens redan skapade occurrence med mallens NYA värden direkt
  // (annars syns inte en redigering förrän occurrencen genereras om, se
  // useTodosState.ts:s refreshRoutineOccurrence). Andra argumentet (2026-08-07)
  // — de redan kända, precis sparade fälten, se anropsstället nedan.
  onRefreshRoutine: (routineId: Id, templatePatch?: Partial<Todo>) => void;
  onClose: () => void;
  fixedTodoTimes?: boolean;
  // Familje-scope (2026-08-06, Zaidas fynd: "när jag ska redigera familjens
  // todo så står det andra kategorier än de som finns i familjen") — modalen
  // öppnas numera (sedan 2026-08-04) ÄVEN från Hem-vyns familjetrådar
  // (MemberShellContent.tsx:s editFamilyTodoId), men kategori-dropdownen
  // filtrerade ALLTID på `!isFamily` oavsett anropskontext (rätt för de
  // personliga anropsställena, fel här — visade Zaidas egna personliga
  // kategorier istället för familjens). Styr filtret explicit istället för
  // att gissa utifrån todon själv (en familje-tilldelad todo kan i teorin
  // sakna kategori helt, `assignedTo===null` räcker inte som signal).
  familyScope?: boolean;
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

// Uppgifts-redigera-modal (2026-07-05, Zaidas beslut) — utbruten ur den
// tidigare kombinerade TodoDetailModal. Öppnas via pennikonen i
// TodoDetailView, inte direkt vid klick på bollen (samma mönster som
// kalenderns CalendarEventDetail → CalendarEventModal).
export function TodoEditModal({
  todo,
  currentMember,
  members,
  roles,
  categories,
  todos,
  onUpdateTodo,
  onCreateCategory,
  onCreateTaskTemplate,
  onDeleteTodo,
  onRefreshRoutine,
  onClose,
  fixedTodoTimes = false,
  familyScope = false
}: Props) {
  const [deleteDenied, setDeleteDenied] = useState(false);
  async function handleDelete() {
    const result = await onDeleteTodo(todo.id);
    const failed = typeof result === "object" && result !== null && "ok" in result && result.ok === false;
    if (failed) {
      setDeleteDenied(true);
      return;
    }
    onClose();
  }

  // Mallbibliotek (2026-07-08) — sparar en frusen ögonblicksbild (titel/ikon/
  // delmoment/återkommelse/stjärnor), fristående från den här specifika
  // uppgiften. Rör inte uppgiften själv, bara en engångsläsning av dagens
  // fältvärden.
  const [templateSaved, setTemplateSaved] = useState(false);
  function handleSaveAsTemplate() {
    onCreateTaskTemplate({
      title: title.trim() || todo.title,
      visual: { type: "lucide-icon", value: emoji },
      notes: notes.trim() || null,
      subtasks: subtasks.filter((s) => s.title.trim().length > 0).map((s) => ({
        title: s.title.trim(),
        timedMinutes: s.timedMinutes ?? null
      })),
      recurrence,
      starValue,
      // Tidtagning, alla uppgifter (2026-08-07, var tidigare bara isForChild).
      timerEnabled,
      plannedDurationMinutes:
        timerEnabled && plannedDurationMinutesInput
          ? Math.max(1, Math.min(480, Math.floor(Number(plannedDurationMinutesInput)) || 1))
          : null
    }).then(() => {
      setTemplateSaved(true);
      window.setTimeout(() => setTemplateSaved(false), SAVED_INDICATOR_MS);
    });
  }

  // En genererad daglig occurrence (recurringSourceId satt) bär EGNA fält som
  // bara är en frusen ögonblicksbild av mallen (recurringTodos.ts). Full
  // fältparitet med skapa-modalen (2026-07-08, Zaidas önskemål: "det ska vara
  // samma i redigera som i skapa... alla fält är viktiga att kunna redigera")
  // löses genom att låta serie-definierande fält (titel/ikon/kategori/
  // mottagare/stjärnor/timer/återkommelse) redigeras på MALLEN — oavsett
  // vilken dags-boll man råkar öppna — medan anteckningar/delmoment stannar
  // kvar på just den öppnade dagen.
  const isGeneratedOccurrence = todo.recurringSourceId !== null;
  const template = isGeneratedOccurrence ? todos.find((t) => t.id === todo.recurringSourceId) ?? null : null;
  const seriesSource = template ?? todo;

  function isRecipientChild(id: string): boolean {
    if (id === SELF_VALUE || id === FAMILY_VALUE) return false;
    return isChildMember(members.find((m) => m.id === id), roles);
  }

  // Alla andra familjemedlemmar (samma mönster som TodoCreatorModal.tsx).
  const assignableMembers = members.filter((m) => m.deletedAt === null && m.id !== currentMember.id);

  // Delmoment kan tilldelas VILKEN familjemedlem som helst (2026-07-23,
  // samma mönster som TodoCreatorModal.tsx), inklusive mig själv.
  const subtaskAssignableMembers = members.filter((m) => m.deletedAt === null);

  const [title, setTitle] = useState(seriesSource.title);
  const [emoji, setEmoji] = useState(seriesSource.visual.value);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    seriesSource.personalCategoryId ?? NO_CATEGORY_VALUE
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  // Åt vem? (2026-07-08, Zaidas önskemål) — enval (till skillnad från
  // skapa-modalens flerval, som skapar en kopia PER mottagare) eftersom
  // redigering rör EN befintlig uppgift/serie, inte flera nya. En otilldelad
  // (Familjen-)todo behandlades tidigare som "antag att den är min egen"
  // (samma villkor som SELF_VALUE) — en riktig bugg nu när Familjen finns
  // som ett eget val (2026-07-23): att spara utan att röra "Åt vem?" hade
  // tyst gjort om en delad familje-uppgift till en personlig.
  const [assigneeId, setAssigneeId] = useState<string>(
    seriesSource.assignedTo === currentMember.id
      ? SELF_VALUE
      : seriesSource.assignedTo === null
        ? FAMILY_VALUE
        : seriesSource.assignedTo
  );
  const isForChild = isRecipientChild(assigneeId);
  // Sträng, inte tal (2026-07-07-fix) — se samma resonemang i TodoCreatorModal.tsx.
  const [starValueInput, setStarValueInput] = useState(String(seriesSource.starValue));
  const starValue = Math.max(0, Math.floor(Number(starValueInput)) || 0);
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(seriesSource.recurrence);
  const [visibleFrom, setVisibleFrom] = useState(isoToDateTimeLocal(todo.visibleFrom));
  const [expiresAt, setExpiresAt] = useState(isoToDateTimeLocal(todo.expiresAt));
  const [startDate, setStartDate] = useState(isoToDateOnly(seriesSource.visibleFrom));
  const [timeWindows, setTimeWindows] = useState<TodoTimeWindow[]>(
    seriesSource.timeWindows && seriesSource.timeWindows.length > 0
      ? seriesSource.timeWindows
      : [{ visibleFrom: seriesSource.visibleFrom, expiresAt: seriesSource.expiresAt }]
  );
  // Anteckningar/delmoment hör till just DEN HÄR dagen, inte serien — läses
  // alltid från occurrencen/uppgiften själv, aldrig mallen.
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>(todo.subtasks ?? []);
  const [timerEnabled, setTimerEnabled] = useState(seriesSource.timerEnabled ?? false);
  const [plannedDurationMinutesInput, setPlannedDurationMinutesInput] = useState(
    seriesSource.plannedDurationMinutes ? String(seriesSource.plannedDurationMinutes) : ""
  );
  // Auto-stopp för en ÖPPEN tidtagning (2026-08-08) — se TodoCreatorModal.tsx.
  const [timerMaxMinutesInput, setTimerMaxMinutesInput] = useState(
    seriesSource.timerMaxMinutes ? String(seriesSource.timerMaxMinutes) : ""
  );
  // "Uppdaterat"-bekräftelsen (2026-07-08, Zaidas önskemål) — kort, tyst
  // bekräftelse istället för en Spara-knapp att trycka på.
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: generateId(), title: "", done: false }]);
  }

  // Enter i delmomentets titelfält räcker för att lägga till nästa (2026-07-23,
  // Zaidas önskemål: "det ska räcka med att trycka enter") — samma mönster
  // som TodoCreatorModal.tsx.
  const subtaskInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocusIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const index = pendingFocusIndexRef.current;
    if (index !== null) {
      subtaskInputRefs.current[index]?.focus();
      pendingFocusIndexRef.current = null;
    }
  }, [subtasks.length]);

  function addSubtaskAndFocusNext() {
    pendingFocusIndexRef.current = subtasks.length;
    addSubtask();
  }

  function updateSubtaskTitle(id: Id, title: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  }

  function updateSubtaskAssignee(id: Id, nextAssignee: string | null) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, assignedTo: nextAssignee } : s)));
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

  const isCreatingCategory = selectedCategoryId === NEW_CATEGORY_VALUE;
  const isTitleMissing = title.trim().length === 0;
  // Se samma resonemang i TodoCreatorModal.tsx — utan startdatum tappar en
  // återkommande mall sitt ankardatum (grundorsaken till incidenten
  // 2026-07-06, se incidents/2026-07-06-barnens-rutiner-forsvann.md).
  const isStartDateMissing = recurrence.type !== "none" && !startDate;
  // Se samma resonemang i TodoCreatorModal.tsx.
  const isEndBeforeStart =
    recurrence.type === "none" && !!visibleFrom && !!expiresAt && expiresAt < visibleFrom;
  const canSubmit = !isTitleMissing && !isStartDateMissing && !isEndBeforeStart && !isRecurrenceIncomplete(recurrence);

  function handleVisibleFromChange(value: string) {
    setVisibleFrom(value);
    if (!expiresAt) {
      setExpiresAt(value);
    }
  }

  // performSave/scheduleAutosave hålls i refs så den alltid kör med FÄRSKA
  // state-värden (undviker stale closures i den debounce-timeout som skapas
  // en gång per render, se useEffect nedan).
  const performSaveRef = useRef<() => Promise<void>>(async () => {});
  performSaveRef.current = async () => {
    if (!canSubmit) return;

    let categoryId: Id | null = selectedCategoryId === NO_CATEGORY_VALUE ? null : selectedCategoryId;
    if (isCreatingCategory) {
      const trimmedName = newCategoryName.trim();
      if (!trimmedName) return;
      // Familje-scope (2026-08-06) — se familyScope-propens kommentar ovan,
      // en ny kategori som skapas MEDAN man redigerar en familjeuppgift ska
      // bli en familjekategori, inte tyst en personlig.
      const category = await onCreateCategory(trimmedName, familyScope);
      categoryId = category.id;
      // Undviker att skapa ännu en kategori nästa gång autospara triggas av en
      // orelaterad ändring — pekar om valet mot den nyss skapade kategorin.
      setSelectedCategoryId(category.id);
    }

    const isRecurring = recurrence.type !== "none";
    const isFamilyRecipient = assigneeId === FAMILY_VALUE;
    const isChildRecipient = isRecipientChild(assigneeId);
    const resolvedAssignedTo = assigneeId === SELF_VALUE ? currentMember.id : isFamilyRecipient ? null : assigneeId;
    const cleanedSubtasks = subtasks
      .map((s) => ({ ...s, title: s.title.trim() }))
      .filter((s) => s.title.length > 0);
    const dayPatch: Partial<Todo> = {
      notes: notes.trim() || null,
      subtasks: cleanedSubtasks,
      // En redan UTGÅNGEN uppgift blir "pending" igen av att man redigerar
      // den (2026-08-08, Zaidas fynd: "om jag t.ex. förlänger sluttiden så
      // vill jag ju att den skall visas igen i todo-vyn") — annars sparades
      // t.ex. en förlängd sluttid korrekt, men uppgiften förblev osynlig i
      // tråd-/listvyn eftersom `status` aldrig återställdes. Samma
      // pendingPatch-återställning som refreshRoutineOccurrence redan gör
      // för DAGENS occurrence (useTodosState.ts) — men den täcker bara
      // just den posten, inte occurrencen man faktiskt sitter och redigerar
      // om det är en ANNAN (t.ex. en äldre, redan utgången bubbla).
      ...(todo.status === "expired"
        ? { status: "pending" as const, completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null }
        : {})
    };

    // Titel/ikon/kategori/mottagare/stjärnor/timer/återkommelse hör till HELA
    // serien, inte bara dagens boll (2026-07-08, Zaidas önskemål om full
    // fältparitet med skapa-modalen) — sparas på mallen om en sådan finns.
    // En Familjen-todo hör bara hemma i Familjen-tråden, aldrig en PERSONLIG
    // kategori-tråd (2026-07-23, samma princip som barnens uppgifter) — men
    // det gäller uttryckligen bara den PERSONLIGA Todos-panelen. I familje-
    // scope (2026-08-07, Zaidas fynd: "jag verkar inte kunna byta kategori i
    // modalen") är motsatsen sann: en familjekategori-uppgift har NORMALT
    // assignedTo:null (Familjen), så isFamilyRecipient är sant för nästan
    // ALLA familje-uppgifter — det ovillkorliga null:et här nollställde
    // alltså kategorivalet på varje autospara, oavsett vad som faktiskt
    // valdes i dropdownen.
    const seriesPatch: Partial<Todo> = {
      title: title.trim(),
      visual: { type: "lucide-icon", value: emoji },
      personalCategoryId: !familyScope && isFamilyRecipient ? null : categoryId,
      assignedTo: resolvedAssignedTo,
      starValue: isChildRecipient ? starValue : 0,
      // Timer, alla mottagare (2026-08-07, var tidigare bara barn).
      timerEnabled,
      plannedDurationMinutes:
        timerEnabled && plannedDurationMinutesInput
          ? Math.max(1, Math.min(480, Math.floor(Number(plannedDurationMinutesInput)) || 1))
          : null,
      // Auto-stopp (2026-08-08) — bara relevant utan Planerad tid.
      timerMaxMinutes:
        timerEnabled && !plannedDurationMinutesInput && timerMaxMinutesInput
          ? Math.max(1, Math.min(720, Math.floor(Number(timerMaxMinutesInput)) || 1))
          : null,
      recurrence,
      // Återkommande: visibleFrom är bara ankardatumet för förfallo-
      // beräkningen (recurringTodos.ts), de faktiska klockslagen kommer från
      // timeWindows. Engångsuppgift: visibleFrom/expiresAt är en fullständig
      // datum+tid som tidigare, timeWindows nollställs (annars kvarstår den
      // dött om uppgiften senare blir återkommande igen utan att fyllas i).
      visibleFrom: isRecurring ? dateOnlyToISO(startDate) : dateTimeLocalToISO(visibleFrom),
      expiresAt: isRecurring ? seriesSource.expiresAt : dateTimeLocalToISO(expiresAt),
      timeWindows: isRecurring ? timeWindows : []
    };

    if (template) {
      onUpdateTodo(template.id, seriesPatch);
      // seriesPatch appliceras HÄR också, direkt på occurrencen man faktiskt
      // tittar på (2026-08-07, Zaidas fynd: "de ligger ändå kvar under
      // dessa kategorier. De går inte att flytta") — refreshRoutineOccurrence
      // nedan synkar bara DAGENS occurrence, vilket INTE nödvändigtvis är
      // samma post som `todo` (en fortfarande obesvarad bubbla genererad en
      // tidigare dag har ett äldre occurrenceDate). Utan denna rad förblev
      // en sådan bubblas kategori/titel/emoji orörd trots en lyckad
      // mall-uppdatering, eftersom ingenting annat pekade tillbaka på just
      // DEN posten.
      onUpdateTodo(todo.id, { ...seriesPatch, ...dayPatch });
      // Speglar mallens nya värden på dagens redan skapade occurrence också,
      // om den skulle vara en ANNAN post än `todo` — annars syns inte
      // ändringen där förrän occurrencen genereras om imorgon. seriesPatch
      // skickas med explicit (2026-08-07) — utan den läste
      // refreshRoutineOccurrence en ÄNNU EJ uppdaterad lokal kopia av mallen
      // (React hinner inte synka todosRef.current innan detta synkrona
      // anrop), och kopierade tyst tillbaka de GAMLA kategori-/emoji-
      // värdena på dagens occurrence, både lokalt och till servern.
      onRefreshRoutine(template.id, seriesPatch);
    } else {
      onUpdateTodo(todo.id, { ...seriesPatch, ...dayPatch });
    }
    setSaveStatus("saved");
  };

  const saveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const savedIndicatorTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // Första körningen är bara state satt från den befintliga todon — inget
    // att spara än.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = null;
      void performSaveRef.current();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title, emoji, selectedCategoryId, newCategoryName, assigneeId, starValueInput, timerEnabled,
    plannedDurationMinutesInput, timerMaxMinutesInput, recurrence, visibleFrom, expiresAt, startDate, timeWindows,
    notes, subtasks
  ]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    if (savedIndicatorTimeoutRef.current !== null) window.clearTimeout(savedIndicatorTimeoutRef.current);
    savedIndicatorTimeoutRef.current = window.setTimeout(() => setSaveStatus("idle"), SAVED_INDICATOR_MS);
    return () => {
      if (savedIndicatorTimeoutRef.current !== null) window.clearTimeout(savedIndicatorTimeoutRef.current);
    };
  }, [saveStatus]);

  // Stänger man direkt efter att ha skrivit klart (innan debounce-fönstret
  // hinner löpa ut) ska den sista ändringen ändå inte tappas bort.
  function handleClose() {
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      void performSaveRef.current();
    }
    onClose();
  }

  const dialogRef = useModalA11y<HTMLDivElement>(handleClose);
  const overlay = useOverlayDismiss(handleClose);

  return (
    <div className="todo-detail-overlay" {...overlay}>
      <div
        aria-labelledby="todo-edit-title"
        aria-modal="true"
        className="todo-detail-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="todo-detail-modal__hdr">
          <span id="todo-edit-title">Redigera uppgift</span>
          <span aria-live="polite" className="todo-edit-modal__save-status">
            {saveStatus === "saved" ? "Uppdaterat ✓" : ""}
          </span>
          <button aria-label="Stäng" className="icon-button" onClick={handleClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="todo-detail-modal__body">
          {isGeneratedOccurrence && (
            <p className="field-hint field-hint--neutral">
              Del av en återkommande serie. Titel, ikon, kategori, mottagare, stjärnor, timer och återkommelse gäller
              hela serien. Anteckningar och delmoment gäller bara den här dagen.
            </p>
          )}

          {assignableMembers.length > 0 && (
            <div className="field-label">
              <span>Åt vem?</span>
              <div aria-label="Åt vem?" className="todo-assignee-picker" role="group">
                <button
                  aria-pressed={assigneeId === SELF_VALUE}
                  className={
                    "todo-assignee-picker__btn" +
                    (assigneeId === SELF_VALUE ? " todo-assignee-picker__btn--on" : "")
                  }
                  onClick={() => setAssigneeId(SELF_VALUE)}
                  type="button"
                >
                  Mig själv
                </button>
                <button
                  aria-pressed={assigneeId === FAMILY_VALUE}
                  className={
                    "todo-assignee-picker__btn" +
                    (assigneeId === FAMILY_VALUE ? " todo-assignee-picker__btn--on" : "")
                  }
                  onClick={() => setAssigneeId(FAMILY_VALUE)}
                  type="button"
                >
                  Familjen
                </button>
                {assignableMembers.map((member) => (
                  <button
                    aria-pressed={assigneeId === member.id}
                    className={
                      "todo-assignee-picker__btn" +
                      (assigneeId === member.id ? " todo-assignee-picker__btn--on" : "")
                    }
                    key={member.id}
                    onClick={() => setAssigneeId(member.id)}
                    type="button"
                  >
                    {member.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="todo-emoji-title-row">
            <EmojiPickerPortal symbol={emoji} onSelect={setEmoji} triggerClassName="todo-emoji-btn" />
            <label className="field-label todo-emoji-title-row__title">
              Titel
              <input className="text-input" onChange={(e) => setTitle(e.target.value)} value={title} />
            </label>
          </div>
          {isTitleMissing && <p className="field-hint">Titel krävs.</p>}

          {/* Personliga kategorier normalt, familjekategorier bara i
              familje-scope (2026-08-06-fixet ovan) — motsvarande resonemang
              i TodoCreatorModal.tsx gäller bara det personliga anropsstället
              där (ingen familje-variant av den modalen finns).
              2026-08-07, Zaidas fynd: en genuint död familjekategori (aldrig
              någon PENDING uppgift, t.ex. ett testartefakt som "xfv" vars
              enda uppgift redan var godkänd) döljs redan i familjevyns
              trådlista (tomma trådar visas inte) men listades ändå här —
              dropdownen ska matcha vad som faktiskt går att se i familjevyn.
              Kollar status==="pending" (samma kriterium som trådvyns egen
              tomhetskontroll), men INTE samma tids-/synlighetsfönster
              (isDueWithinRange/idag-vecka-månad) — status flimrar inte med
              klockan så det är säkert, ett tidsfönster hade fått listan att
              flimra till/från beroende på när på dagen man tittar. Den redan
              VALDA kategorin visas alltid, oavsett — annars hade den
              försvunnit ur sin egen dropdown. */}
          <label className="field-label">
            Kategori
            <select
              className="text-input"
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              value={selectedCategoryId}
            >
              <option value={NO_CATEGORY_VALUE}>Ingen kategori</option>
              {categories
                .filter((category) => Boolean(category.isFamily) === familyScope)
                .filter(
                  (category) =>
                    !familyScope ||
                    category.id === selectedCategoryId ||
                    // "pending", inte bara "finns" (2026-08-07, Zaidas fynd:
                    // "xfv är kvar som kategori?") — en kategori vars enda
                    // uppgift redan är godkänd/klar räknas av familjevyn som
                    // tom (den kollar status==="pending"), så dropdownen ska
                    // göra detsamma. Status flimrar inte med klockan (till
                    // skillnad från tids-/synlighetsfönster), så det stabila
                    // "tidsoberoende"-resonemanget ovan håller fortfarande.
                    todos.some(
                      (t) => t.personalCategoryId === category.id && t.deletedAt === null && t.status === "pending"
                    )
                )
                .map((category) => (
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
                onChange={(e) => setStarValueInput(e.target.value)}
                type="number"
                value={starValueInput}
              />
            </label>
          )}

          {/* Timer, alla uppgifter (2026-08-07, var tidigare bara isForChild)
              — se TodoCreatorModal.tsx:s motsvarande kommentar. */}
          <label className="todo-timer-toggle">
            <input
              checked={timerEnabled}
              onChange={(e) => setTimerEnabled(e.target.checked)}
              type="checkbox"
            />
            Använd en timer för uppgiften
          </label>

          {timerEnabled && (
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
                Visar en nedräkning där uppgiften används. Lämnas det tomt visas en vanlig tidtagning istället.
              </span>
            </label>
          )}

          {timerEnabled && !plannedDurationMinutesInput && (
            <label className="field-label">
              Stanna timern automatiskt efter (minuter)
              <input
                className="text-input"
                min={1}
                max={720}
                onChange={(e) => setTimerMaxMinutesInput(e.target.value)}
                placeholder="120 (2h) om tomt"
                type="number"
                value={timerMaxMinutesInput}
              />
              <span className="field-hint field-hint--neutral">
                Skyddar mot en bortglömd tidtagning — resultatet av en avslutad tidtagning sparas i Medaljer/Rekord.
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
              className="text-input todo-edit-modal__notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valfritt"
              rows={3}
              value={notes}
            />
          </label>

          <div className="field-label">
            <span>Delmoment (egen checklista)</span>
            <ul className="todo-edit-modal__subtasks">
              {subtasks.map((subtask, index) => (
                <li key={subtask.id} className="todo-edit-modal__subtask-row">
                  {subtaskAssignableMembers.length > 0 && (
                    <SubtaskAssigneeButton
                      assignedTo={subtask.assignedTo}
                      members={subtaskAssignableMembers}
                      onCycle={(next) => updateSubtaskAssignee(subtask.id, next)}
                    />
                  )}
                  <input
                    aria-label="Delmomentets titel"
                    className="text-input"
                    onChange={(e) => updateSubtaskTitle(subtask.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && subtask.title.trim()) {
                        e.preventDefault();
                        addSubtaskAndFocusNext();
                      }
                    }}
                    placeholder="Till exempel Uppvärmning"
                    ref={(el) => { subtaskInputRefs.current[index] = el; }}
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

          {deleteDenied && (
            <p className="field-hint">
              Kunde inte radera — antingen ett serverfel (försök igen), eller så har du inte behörighet (du kan bara radera uppgifter du själv skapat, om inte en admin gett dig utökad behörighet).
            </p>
          )}
          <div className="todo-edit-modal__actions">
            <button className="secondary-button" onClick={handleSaveAsTemplate} type="button">
              <FileStack size={15} />
              {templateSaved ? "Sparad som mall ✓" : "Spara som mall"}
            </button>
            <button className="danger-button" onClick={handleDelete} type="button">
              <Trash2 size={15} />
              Radera
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
