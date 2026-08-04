import "./TodoImportExport.css";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Pencil, Trash2, Upload } from "lucide-react";
import type { Id, Member, Role, Todo, TodoCategory, TodoTemplate, TodoTemplateTask } from "@shared/types";
import { generateId } from "../../utils/uuid";
import { buildTemplateCsv, downloadCsv, parseTodoCsv, todosToCsv, type ParsedTodoRow } from "./todoCsv";
import { fmtFullDate, fmtTime } from "../calendars/calendarHelpers";
import { getAssigneeName, getVisibleTodos, groupByChildAssignee, isChildMember } from "./selectors";
import { describeRecurrence, describeRecurrenceEnd } from "./recurringTodos";
import { TodoEditModal } from "./TodoEditModal";
import { useCrossAccountFamilyTodos } from "./useCrossAccountFamilyState";
import { useConnectionTodos } from "../accounts/useFamilyConnectionsState";
import type { ImportResult, ImportUndo } from "./useTodosState";

type Props = {
  currentMember: Member;
  members: Member[];
  // Behövs för isChildMember (2026-08-04, buggfynd: exportens "Barn"-
  // kryssruta kollade tidigare bara member.isChild direkt — inte samma
  // helper (isChildMember) som resten av appen använder, som ÄVEN faller
  // tillbaka på rollens isChildRole. Ett barn vars Member.isChild av någon
  // anledning stod fel (samma klass av trasig data som 2026-07-15s Wilja/
  // Maja-incident) exporterades då aldrig med, tyst, även med kryssrutan i).
  roles: Role[];
  todos: Todo[];
  categories: TodoCategory[];
  // Returnerar nu ett promise (2026-08-04, Zaidas fynd: "kvällsrutiner och
  // tvätt blir dubletter" efter Ångra-senaste-import→ny-import i snabb
  // följd) — runImport VÄNTAR IN varje rad innan nästa påbörjas, så en
  // efterföljande "Ångra"-radering aldrig kan hinna nå servern innan
  // skapandet/uppdateringen den ska ångra ens sparats där.
  onCreateTodo: (todo: Todo) => Promise<unknown> | void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => Promise<unknown> | void;
  onDeleteTodo: (todoId: Id) => void;
  onCreateCategory: (name: string, isFamily?: boolean) => Promise<TodoCategory>;
  // Behövs bara för den samlade visa+redigera-tabellen nedan (2026-08-04,
  // Zaidas önskemål: "se alla samlade todos som jag både kan visa och
  // redigera utifrån mina behörigheter") — samma TodoEditModal som
  // RecurringTodosSettings.tsx/OneOffTodosSettings.tsx redan öppnar. Valfria
  // eftersom tabellen bara visas i personlig scope (Inställningar); i
  // familje-scope (Hem-vyn) saknas de än så länge, ingen ny tråd genom
  // MemberOverview.tsx behövdes för just den ytan.
  onCreateTaskTemplate?: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onRefreshRoutine?: (routineId: Id) => void;
  // "family" (2026-08-03, Zaidas önskemål: massimport/export av familjens
  // uppgifter i Hem-vyn) — samma komponent, tre skillnader: kryssrutelistan
  // visar familjekategorier istället för mina egna (ingen Barn-kryssruta,
  // familjevyn innehåller aldrig barns uppgifter), en tom "Tilldelad"-cell
  // betyder Familjen istället för mig själv, och `todos`/`categories` antas
  // redan vara familje-scopade av anroparen (ingen extra assignedTo/
  // createdBy-koll behövs vid Id-matchning för uppdatering).
  scope?: "personal" | "family";
  // Ligger i useTodosState (2026-07-08, Zaidas önskemål: "ångra senaste import
  // måste vara kvar även om jag växlar vy") istället för lokal state här —
  // Shell.tsx:s <ErrorBoundary key={activePanel}> ommonterar hela panelen vid
  // varje panelbyte, vilket annars nollställde både resultatet och ångra-läget.
  result: ImportResult | null;
  setResult: (result: ImportResult | null) => void;
  lastImportUndo: ImportUndo | null;
  setLastImportUndo: (undo: ImportUndo | null) => void;
};

const CHILDREN_FILTER_ID = "__children__";
const NO_CATEGORY_FILTER_ID = "__none__";
const SKIP_RESOLUTION = "__skip__";

function buildNewTodo(row: ParsedTodoRow, currentMemberId: Id, categoryId: Id | null, assignedTo: Id | null): Todo {
  return {
    id: `todo-${generateId()}`,
    title: row.title,
    createdBy: currentMemberId,
    assignedTo,
    isShared: false,
    status: "pending",
    starValue: row.starValue,
    timerEnabled: row.timerEnabled,
    plannedDurationMinutes: row.plannedDurationMinutes,
    elapsedMs: null,
    visual: { type: "lucide-icon", value: row.emoji },
    recurrence: row.recurrence,
    recurringSourceId: null,
    occurrenceDate: null,
    visibleFrom: row.visibleFrom,
    expiresAt: row.expiresAt,
    timeWindows: row.timeWindows,
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    deletedAt: null,
    deletedBy: null,
    personalCategoryId: categoryId,
    subtasks: row.subtasks.length > 0 ? row.subtasks : undefined,
    notes: row.notes
  };
}

// Uppdaterings-patch (2026-07-07, Zaidas önskemål: "uppdatera todolistan med
// export och import") — rör MEDVETET inte assignedTo/createdBy/id/status,
// bara samma fält en vanlig redigering också får ändra.
function buildUpdatePatch(row: ParsedTodoRow, categoryId: Id | null): Partial<Todo> {
  return {
    title: row.title,
    visual: { type: "lucide-icon", value: row.emoji },
    starValue: row.starValue,
    timerEnabled: row.timerEnabled,
    plannedDurationMinutes: row.plannedDurationMinutes,
    recurrence: row.recurrence,
    visibleFrom: row.visibleFrom,
    expiresAt: row.expiresAt,
    timeWindows: row.timeWindows,
    personalCategoryId: categoryId,
    subtasks: row.subtasks.length > 0 ? row.subtasks : undefined,
    notes: row.notes
  };
}

// Samma fält som buildUpdatePatch — läser av EXISTERANDE värden innan en
// uppdatering appliceras, så "Ångra senaste import" (2026-07-08, Zaidas
// önskemål efter att ha ångrat en import: "vi behöver en knapp för att ångra
// senaste import") kan återställa exakt det som skrevs över.
function extractPatchFields(todo: Todo): Partial<Todo> {
  return {
    title: todo.title,
    visual: todo.visual,
    starValue: todo.starValue,
    timerEnabled: todo.timerEnabled,
    plannedDurationMinutes: todo.plannedDurationMinutes,
    recurrence: todo.recurrence,
    visibleFrom: todo.visibleFrom,
    expiresAt: todo.expiresAt,
    timeWindows: todo.timeWindows,
    personalCategoryId: todo.personalCategoryId,
    subtasks: todo.subtasks,
    notes: todo.notes
  };
}

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål, utökad
// samma dag till att även täcka återkommelse). En rad = en mall (för
// återkommande) eller en engångsuppgift. Flera tidsintervall per dag
// (Todo.timeWindows) täcks INTE — för komplext för en enda kalkylarksrad.
// 2026-07-07 utökad med: uppdatering av befintliga uppgifter via ett Id-fält
// (istället för att alltid skapa nya), kategorival vid export, och en
// mappningsdialog för "Tilldelad"-namn som inte finns i importörens familj
// (för att dela listor MELLAN familjer utan att barnens riktiga namn behöver
// matcha — Zaidas resonemang).
export function TodoImportExport({
  currentMember,
  members,
  roles,
  todos,
  categories,
  onCreateTodo,
  onUpdateTodo,
  onDeleteTodo,
  onCreateCategory,
  onCreateTaskTemplate,
  onRefreshRoutine,
  result,
  setResult,
  lastImportUndo,
  setLastImportUndo,
  scope = "personal"
}: Props) {
  const isFamilyScope = scope === "family";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  // Väntar på att importören mappar okända "Tilldelad"-namn innan importen
  // faktiskt körs — null när ingen mappning behövs (det vanliga fallet, en
  // export/import inom samma familj).
  const [pendingImport, setPendingImport] = useState<{ rows: ParsedTodoRow[]; errors: string[] } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Id | typeof SKIP_RESOLUTION>>({});
  // Samlad visa+redigera-tabell (2026-08-04, Zaidas önskemål: "se alla
  // samlade todos som jag både kan visa och redigera utifrån mina
  // behörigheter... den mallen ska jag först kunna exportera") — samma
  // permissions-scopade selector (getVisibleTodos) som RecurringTodosSettings/
  // OneOffTodosSettings.tsx redan använder (canSeeAllTodos ser allt inkl.
  // barnens, canSeeOwnTodos en snävare mängd), bara ENDA gången kombinerad
  // (mallar OCH engångsuppgifter tillsammans i en enda lista istället för två
  // separata sektioner) — motsvarar exakt samma mängd som todosToCsv()
  // exporterar (recurringSourceId===null, dagens genererade occurrences
  // exkluderade). Bara i personlig scope — familje-scope (Hem-vyn) har redan
  // sin egen tvåstegsbekräftade massa-hantering (FamilyTodoThreads.tsx).
  const [editingId, setEditingId] = useState<Id | null>(null);
  const allBrowsableTodos = isFamilyScope
    ? []
    : getVisibleTodos(currentMember, roles, todos).filter((t) => t.recurringSourceId === null);
  const editingTodo = allBrowsableTodos.find((t) => t.id === editingId) ?? null;
  const { childItems: browsableChildTodos, otherItems: browsableOtherTodos } = groupByChildAssignee(
    allBrowsableTodos,
    members,
    roles
  );

  function describeBrowsableRow(todo: Todo): string {
    if (todo.recurrence.type === "recurring") {
      const end = describeRecurrenceEnd(todo.recurrence);
      return end ? `${describeRecurrence(todo.recurrence)} (${end})` : describeRecurrence(todo.recurrence);
    }
    if (todo.visibleFrom && todo.expiresAt) {
      return `${fmtFullDate(todo.visibleFrom)} · ${fmtTime(todo.visibleFrom)}–${fmtTime(todo.expiresAt)}`;
    }
    if (todo.visibleFrom) return `Syns från ${fmtFullDate(todo.visibleFrom)} ${fmtTime(todo.visibleFrom)}`;
    if (todo.expiresAt) return `Försvinner ${fmtFullDate(todo.expiresAt)} ${fmtTime(todo.expiresAt)}`;
    return "Inget schema";
  }

  // Andra familjer (2026-08-04, Zaidas önskemål: "i inställningar skall jag
  // se todos som tillhör dess familjenamn... jag skall även kunna skapa
  // todos därifrån till familjen, eller till flera familjer") — samma två
  // cross-account-hookar som Hem-vyns familjefilter (MemberShellContent.tsx)
  // redan använder, anropade en gång till HÄR (egen, oberoende SSE-
  // prenumeration/hämtning bara medan denna Inställningar-flik är öppen,
  // medvetet inte lyft till ett delat ställe — samma "duplicering hellre än
  // en riskabel cross-cutting refaktor"-avvägning som redan gjorts för andra
  // saker denna session). Mina familjekonton är ALLTID skapningsbara (samma
  // "genuint medlemskap"-regel som redan gäller i Hem-vyn); en
  // Familjeanslutning bara om den har redigera-åtkomst.
  const { threads: crossAccountThreads, createCrossAccountTodo } = useCrossAccountFamilyTodos();
  const { threads: connectionThreads, createConnectionTodo } = useConnectionTodos();
  const otherFamilies = [
    ...crossAccountThreads.map((t) => ({ accountId: t.accountId, accountName: t.accountName, todos: t.todos, creatable: true })),
    ...connectionThreads.map((t) => ({ accountId: t.accountId, accountName: t.accountName, todos: t.todos, creatable: t.access === "edit" }))
  ];
  const [newFamilyTodoTitle, setNewFamilyTodoTitle] = useState("");
  const [newFamilyTodoTargets, setNewFamilyTodoTargets] = useState<Set<string>>(new Set(["__own__"]));

  function toggleFamilyTodoTarget(id: string) {
    setNewFamilyTodoTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitNewFamilyTodo() {
    const title = newFamilyTodoTitle.trim();
    if (!title || newFamilyTodoTargets.size === 0) return;
    if (newFamilyTodoTargets.has("__own__")) {
      onCreateTodo({
        id: `todo-${generateId()}`,
        title,
        createdBy: currentMember.id,
        assignedTo: null,
        isShared: false,
        status: "pending",
        starValue: 0,
        visual: { type: "lucide-icon", value: "⭐" },
        recurrence: { type: "none" },
        recurringSourceId: null,
        occurrenceDate: null,
        visibleFrom: null,
        expiresAt: null,
        completedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: null,
        deletedAt: null,
        deletedBy: null,
        personalCategoryId: null,
        subtasks: undefined,
        notes: null
      });
    }
    for (const family of otherFamilies) {
      if (!family.creatable || !newFamilyTodoTargets.has(family.accountId)) continue;
      if (crossAccountThreads.some((t) => t.accountId === family.accountId)) {
        createCrossAccountTodo(family.accountId, title, "⭐");
      } else {
        createConnectionTodo(family.accountId, title, "⭐");
      }
    }
    setNewFamilyTodoTitle("");
    setNewFamilyTodoTargets(new Set(["__own__"]));
  }

  // Gömda kategorier (redan tomma trådar i tråd-vyn) hålls utanför export-
  // filtret också — annars listas de dubbelt (t.ex. bredvid "🙈 Gömda
  // kategorier"-sektionen i samma Inställningar-panel). I familje-scope
  // (2026-08-03) visas familjekategorier (isFamily:true) istället för mina
  // egna personliga.
  const myCategories = categories.filter(
    (c) => !c.hidden && (isFamilyScope ? c.isFamily : c.memberId === currentMember.id && !c.isFamily)
  );
  // Standard: allt ikryssat (oförändrat beteende om man inte aktivt väljer
  // bort något) — Zaidas önskemål: "måste kunna välja vilka todolistor man
  // vill dela, alla eller bara en eller några". Ingen Barn-kryssruta i
  // familje-scope — familjevyn innehåller aldrig barns uppgifter.
  const [exportSelection, setExportSelection] = useState<Set<string>>(
    () =>
      new Set([
        ...(isFamilyScope ? [] : [CHILDREN_FILTER_ID]),
        NO_CATEGORY_FILTER_ID,
        ...myCategories.map((c) => c.id)
      ])
  );

  function toggleExportSelection(id: string) {
    setExportSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDownloadTemplate() {
    downloadCsv(isFamilyScope ? "familj-mall.csv" : "todo-mall.csv", buildTemplateCsv());
  }

  function handleExport() {
    const included = todos.filter((todo) => {
      const assignee = members.find((m) => m.id === todo.assignedTo);
      if (isChildMember(assignee, roles)) return exportSelection.has(CHILDREN_FILTER_ID);
      return todo.personalCategoryId
        ? exportSelection.has(todo.personalCategoryId)
        : exportSelection.has(NO_CATEGORY_FILTER_ID);
    });
    downloadCsv(
      isFamilyScope ? "familjens-todos.csv" : "mina-todos.csv",
      todosToCsv(included, members, currentMember.id, categories)
    );
  }

  async function runImport(
    rows: ParsedTodoRow[],
    parseErrors: string[],
    resolutionMap: Record<string, Id | typeof SKIP_RESOLUTION>
  ) {
    setImporting(true);
    try {
      // Cachar nyskapade kategorinamn under importen så flera rader med
      // samma nya kategori inte skapar en dubblett var.
      const createdCategoryIds = new Map<string, Id>();
      let created = 0;
      let updated = 0;
      let deleted = 0;
      const undoUpdated: ImportUndo["updated"] = [];
      const undoCreatedIds: Id[] = [];

      // Bunta i grupper om 4 rader, samma mönster/orsak som ADR-0023
      // (2026-07-16, ett konto delar ofta en enda hem-IP över flera
      // medlemmar). onCreateTodo/onUpdateTodo väntas numera in per rad
      // (2026-08-04) — requesterna kan alltså inte längre komma i en enda
      // burst, men en kort paus var 4:e rad kvarstår ändå som extra marginal
      // mot rate-limiten utan att göra importen märkbart segare.
      const BATCH_SIZE = 4;
      let rowsSinceBatchPause = 0;

      for (const row of rows) {
        rowsSinceBatchPause++;
        if (rowsSinceBatchPause > BATCH_SIZE) {
          rowsSinceBatchPause = 1;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        // Radera (2026-08-04, Zaidas önskemål: "ladda ner alla todos,
        // uppdatera, lägga till nya och radera de jag inte vill ha kvar
        // längre, sedan importera") — samma matchningsregel som en vanlig
        // uppdatering (Id + ägarskap/scope), men raderar istället för att
        // patcha. Ingen Ångra-spårning (se ImportResult-kommentaren i
        // useTodosState.ts) — landar i den vanliga papperskorgen.
        if (row.deleteRow) {
          const existing = row.sourceId
            ? todos.find(
                (t) =>
                  t.id === row.sourceId &&
                  t.deletedAt === null &&
                  (isFamilyScope || t.assignedTo === currentMember.id || t.createdBy === currentMember.id)
              )
            : undefined;
          if (existing) {
            onDeleteTodo(existing.id);
            deleted++;
          } else {
            parseErrors.push(
              `Rad markerad Radera ("${row.title}"): hittade ingen egen uppgift med Id "${row.sourceId}", ingenting raderades.`
            );
          }
          continue;
        }

        let assignedTo = row.assignedTo;
        if (row.unresolvedAssigneeLabel) {
          const resolution = resolutionMap[row.unresolvedAssigneeLabel];
          if (!resolution || resolution === SKIP_RESOLUTION) continue;
          assignedTo = resolution;
        }

        let categoryId = row.personalCategoryId;
        if (!categoryId && row.newCategoryName) {
          const key = row.newCategoryName.toLowerCase();
          const cached = createdCategoryIds.get(key);
          if (cached) {
            categoryId = cached;
          } else {
            const category = await onCreateCategory(row.newCategoryName, isFamilyScope);
            createdCategoryIds.set(key, category.id);
            categoryId = category.id;
          }
        }

        // Matchar mot en egen, ej raderad todo med samma Id — annars skapas en
        // ny (samma fallback som om Id-kolumnen saknas helt, t.ex. en mall).
        // I familje-scope är `todos`-propen redan familje-scopad av
        // anroparen (2026-08-03) — ingen extra assignedTo/createdBy-koll
        // behövs där, till skillnad från den personliga varianten, vars
        // `todos`-prop är HELA kontots lista.
        const existing = row.sourceId
          ? todos.find(
              (t) =>
                t.id === row.sourceId &&
                t.deletedAt === null &&
                (isFamilyScope || t.assignedTo === currentMember.id || t.createdBy === currentMember.id)
            )
          : undefined;

        if (existing) {
          undoUpdated.push({ id: existing.id, previous: extractPatchFields(existing) });
          // Inväntad (2026-08-04) — se Props-kommentaren ovan.
          await onUpdateTodo(existing.id, buildUpdatePatch(row, categoryId));
          updated++;
        } else {
          const newTodo = buildNewTodo(row, currentMember.id, categoryId, assignedTo);
          undoCreatedIds.push(newTodo.id);
          await onCreateTodo(newTodo);
          created++;
        }
      }

      setResult({ created, updated, deleted, errors: parseErrors });
      setLastImportUndo({ updated: undoUpdated, createdIds: undoCreatedIds });
      setPendingImport(null);
      setResolutions({});
    } finally {
      setImporting(false);
    }
  }

  // Ångra senaste import (2026-07-08, Zaidas önskemål) — återställer varje
  // uppdaterad todo till dess värden precis innan importen, och tar bort
  // (mjukt) varje todo som importen skapade. Fungerar bara för importer körda
  // EFTER att den här knappen fanns — kan inte återställa ett tillstånd som
  // aldrig sparades.
  function handleUndoLastImport() {
    if (!lastImportUndo) return;
    for (const id of lastImportUndo.createdIds) {
      onDeleteTodo(id);
    }
    for (const { id, previous } of lastImportUndo.updated) {
      onUpdateTodo(id, previous);
    }
    setLastImportUndo(null);
    setResult(null);
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setResult(null);
    const text = await file.text();
    const { rows, errors } = parseTodoCsv(
      text,
      members,
      categories,
      currentMember.id,
      isFamilyScope ? null : currentMember.id
    );

    const unresolvedLabels = [
      ...new Set(rows.filter((r) => r.unresolvedAssigneeLabel).map((r) => r.unresolvedAssigneeLabel as string))
    ];
    if (unresolvedLabels.length > 0) {
      setPendingImport({ rows, errors });
      setResolutions({});
      return;
    }

    await runImport(rows, errors, {});
  }

  const unresolvedLabels = pendingImport
    ? [...new Set(pendingImport.rows.filter((r) => r.unresolvedAssigneeLabel).map((r) => r.unresolvedAssigneeLabel as string))]
    : [];
  const allResolved = unresolvedLabels.every((label) => resolutions[label]);
  const activeMembers = members.filter((m) => m.deletedAt === null);

  return (
    <div className="todo-import-export">
      <p className="todo-import-export__intro">
        {isFamilyScope
          ? "Exportera familjens uppgifter till ett kalkylark, eller ladda ner en tom mall att fylla i och importera tillbaka. En tom \"Tilldelad\"-cell betyder Familjen. Skriv \"Ja\" i Radera-kolumnen på en rad med ett Id för att ta bort den uppgiften istället för att uppdatera den."
          : "Exportera dina egna uppgifter till ett kalkylark, eller ladda ner en tom mall att fylla i och importera tillbaka. Både engångsuppgifter och återkommande mallar (med sina scheman) räknas med. Importerar du en fil som redan innehåller Id:n för dina egna uppgifter uppdateras de istället för att skapas som nya — skriv \"Ja\" i Radera-kolumnen på en rad med ett Id för att ta bort den uppgiften istället."}
      </p>

      {!isFamilyScope && (
        <>
          {allBrowsableTodos.length === 0 ? (
            <p className="empty-note">Inga uppgifter att visa än.</p>
          ) : (
            <div className="todo-import-export__browse-groups">
              {browsableChildTodos.length > 0 && (
                <div>
                  <h4 className="todo-import-export__browse-heading">👶 Barn</h4>
                  <ul className="todo-import-export__browse-list">
                    {browsableChildTodos.map((todo) => (
                      <li className="todo-import-export__browse-row" key={todo.id}>
                        <div className="todo-import-export__browse-info">
                          <strong>
                            {todo.visual.value && <span aria-hidden="true">{todo.visual.value} </span>}
                            {todo.title}
                          </strong>
                          <small>
                            {getAssigneeName(todo, members)} · {describeBrowsableRow(todo)}
                          </small>
                        </div>
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
                          aria-label={`Ta bort ${todo.title}`}
                          className="icon-button danger"
                          onClick={() => onDeleteTodo(todo.id)}
                          title="Ta bort"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {browsableOtherTodos.length > 0 && (
                <div>
                  <h4 className="todo-import-export__browse-heading">Övriga</h4>
                  <ul className="todo-import-export__browse-list">
                    {browsableOtherTodos.map((todo) => (
                      <li className="todo-import-export__browse-row" key={todo.id}>
                        <div className="todo-import-export__browse-info">
                          <strong>
                            {todo.visual.value && <span aria-hidden="true">{todo.visual.value} </span>}
                            {todo.title}
                          </strong>
                          <small>
                            {todo.assignedTo !== currentMember.id && `${getAssigneeName(todo, members)} · `}
                            {describeBrowsableRow(todo)}
                          </small>
                        </div>
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
                          aria-label={`Ta bort ${todo.title}`}
                          className="icon-button danger"
                          onClick={() => onDeleteTodo(todo.id)}
                          title="Ta bort"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {editingTodo && onCreateTaskTemplate && onRefreshRoutine && (
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
            />
          )}

          {otherFamilies.length > 0 && (
            <div className="todo-import-export__browse-groups">
              <h4 className="todo-import-export__browse-heading">🏠 Andra familjer</h4>
              {otherFamilies.map((family) => (
                <div key={family.accountId}>
                  <h4 className="todo-import-export__browse-heading">{family.accountName}</h4>
                  {family.todos.length === 0 ? (
                    <p className="empty-note">Inga uppgifter just nu.</p>
                  ) : (
                    <ul className="todo-import-export__browse-list">
                      {family.todos.map((todo) => (
                        <li className="todo-import-export__browse-row" key={todo.id}>
                          <div className="todo-import-export__browse-info">
                            <strong>
                              {todo.visual.value && <span aria-hidden="true">{todo.visual.value} </span>}
                              {todo.title}
                            </strong>
                            <small>{describeBrowsableRow(todo)}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); submitNewFamilyTodo(); }}>
            <fieldset className="todo-import-export__filter">
              <legend>Lägg till en uppgift åt familjen/familjer</legend>
              <input
                aria-label="Titel på ny familjeuppgift"
                className="text-input"
                onChange={(e) => setNewFamilyTodoTitle(e.target.value)}
                placeholder="Ny uppgift…"
                value={newFamilyTodoTitle}
              />
              <label>
                <input
                  checked={newFamilyTodoTargets.has("__own__")}
                  onChange={() => toggleFamilyTodoTarget("__own__")}
                  type="checkbox"
                />
                Min egen familj
              </label>
              {otherFamilies.filter((f) => f.creatable).map((family) => (
                <label key={family.accountId}>
                  <input
                    checked={newFamilyTodoTargets.has(family.accountId)}
                    onChange={() => toggleFamilyTodoTarget(family.accountId)}
                    type="checkbox"
                  />
                  {family.accountName}
                </label>
              ))}
              <button
                className="secondary-button"
                disabled={!newFamilyTodoTitle.trim() || newFamilyTodoTargets.size === 0}
                type="submit"
              >
                Lägg till
              </button>
            </fieldset>
          </form>
        </>
      )}

      <fieldset className="todo-import-export__filter">
        <legend>Vad ska exporteras?</legend>
        {!isFamilyScope && (
          <label>
            <input
              checked={exportSelection.has(CHILDREN_FILTER_ID)}
              onChange={() => toggleExportSelection(CHILDREN_FILTER_ID)}
              type="checkbox"
            />
            Barn
          </label>
        )}
        <label>
          <input
            checked={exportSelection.has(NO_CATEGORY_FILTER_ID)}
            onChange={() => toggleExportSelection(NO_CATEGORY_FILTER_ID)}
            type="checkbox"
          />
          Utan kategori
        </label>
        {myCategories.map((category) => (
          <label key={category.id}>
            <input
              checked={exportSelection.has(category.id)}
              onChange={() => toggleExportSelection(category.id)}
              type="checkbox"
            />
            {category.name}
          </label>
        ))}
      </fieldset>

      <div className="todo-import-export__actions">
        <button className="secondary-button" onClick={handleDownloadTemplate} type="button">
          <FileSpreadsheet size={16} />
          Ladda ner mall (CSV)
        </button>
        <button className="secondary-button" onClick={handleExport} type="button">
          <Download size={16} />
          {isFamilyScope ? "Exportera familjens uppgifter (CSV)" : "Exportera mina uppgifter (CSV)"}
        </button>
        <button
          className="secondary-button"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <Upload size={16} />
          {importing ? "Importerar…" : "Importera från CSV"}
        </button>
        <input
          accept=".csv,text/csv"
          aria-label="Importera CSV-fil"
          hidden
          onChange={(e) => {
            void handleImportFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
      </div>

      {pendingImport && (
        <div className="todo-import-export__resolution" role="status">
          <p>
            Filen innehåller {unresolvedLabels.length === 1 ? "ett namn" : `${unresolvedLabels.length} namn`} som inte
            finns i din familj — troligen delad från en annan familjs export. Välj vem i din familj varje namn menas,
            eller hoppa över de raderna.
          </p>
          {unresolvedLabels.map((label) => (
            <label className="todo-import-export__resolution-row" key={label}>
              {label}
              <select
                onChange={(e) =>
                  setResolutions((prev) => ({ ...prev, [label]: e.target.value as Id | typeof SKIP_RESOLUTION }))
                }
                value={resolutions[label] ?? ""}
              >
                <option disabled value="">
                  Välj…
                </option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value={SKIP_RESOLUTION}>Hoppa över dessa rader</option>
              </select>
            </label>
          ))}
          <div className="todo-import-export__resolution-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setPendingImport(null);
                setResolutions({});
              }}
              type="button"
            >
              Avbryt
            </button>
            <button
              className="primary-button"
              disabled={!allResolved || importing}
              onClick={() => void runImport(pendingImport.rows, pendingImport.errors, resolutions)}
              type="button"
            >
              Fortsätt importera
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="todo-import-export__result" role="status">
          <p>
            {result.created} {result.created === 1 ? "uppgift" : "uppgifter"} importerade
            {result.updated > 0 &&
              `, ${result.updated} ${result.updated === 1 ? "uppgift" : "uppgifter"} uppdaterade`}
            {result.deleted > 0 &&
              `, ${result.deleted} ${result.deleted === 1 ? "uppgift" : "uppgifter"} raderade`}
            .
          </p>
          {result.errors.length > 0 && (
            <ul className="todo-import-export__errors">
              {result.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {lastImportUndo && (lastImportUndo.updated.length > 0 || lastImportUndo.createdIds.length > 0) && (
            <button className="secondary-button" onClick={handleUndoLastImport} type="button">
              Ångra senaste import
            </button>
          )}
        </div>
      )}
    </div>
  );
}
