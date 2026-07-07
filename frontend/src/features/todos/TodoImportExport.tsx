import "./TodoImportExport.css";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import type { Id, Member, Todo, TodoCategory } from "@shared/types";
import { generateId } from "../../utils/uuid";
import { buildTemplateCsv, downloadCsv, parseTodoCsv, todosToCsv, type ParsedTodoRow } from "./todoCsv";

type Props = {
  currentMember: Member;
  members: Member[];
  todos: Todo[];
  categories: TodoCategory[];
  onCreateTodo: (todo: Todo) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onDeleteTodo: (todoId: Id) => void;
  onCreateCategory: (name: string) => Promise<TodoCategory>;
};

const CHILDREN_FILTER_ID = "__children__";
const NO_CATEGORY_FILTER_ID = "__none__";
const SKIP_RESOLUTION = "__skip__";

function buildNewTodo(row: ParsedTodoRow, currentMemberId: Id, categoryId: Id | null, assignedTo: Id): Todo {
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
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    deletedAt: null,
    deletedBy: null,
    routineCategory: row.routineCategory,
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
    routineCategory: row.routineCategory,
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
    routineCategory: todo.routineCategory,
    personalCategoryId: todo.personalCategoryId,
    subtasks: todo.subtasks,
    notes: todo.notes
  };
}

type ImportUndo = {
  // Uppdaterade rader: id + de värden de hade INNAN denna import.
  updated: { id: Id; previous: Partial<Todo> }[];
  // Nyskapade rader: bara deras id, ångras med en mjuk radering.
  createdIds: Id[];
};

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
  todos,
  categories,
  onCreateTodo,
  onUpdateTodo,
  onDeleteTodo,
  onCreateCategory
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  // Ångra senaste import (2026-07-08) — null när det inte finns något att
  // ångra (ingen import körd än denna session, eller redan ångrad).
  const [lastImportUndo, setLastImportUndo] = useState<ImportUndo | null>(null);
  // Väntar på att importören mappar okända "Tilldelad"-namn innan importen
  // faktiskt körs — null när ingen mappning behövs (det vanliga fallet, en
  // export/import inom samma familj).
  const [pendingImport, setPendingImport] = useState<{ rows: ParsedTodoRow[]; errors: string[] } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Id | typeof SKIP_RESOLUTION>>({});

  // Gömda kategorier (redan tomma trådar i tråd-vyn) hålls utanför export-
  // filtret också — annars listas de dubbelt (t.ex. bredvid "🙈 Gömda
  // kategorier"-sektionen i samma Inställningar-panel).
  const myCategories = categories.filter((c) => c.memberId === currentMember.id && !c.hidden);
  // Standard: allt ikryssat (oförändrat beteende om man inte aktivt väljer
  // bort något) — Zaidas önskemål: "måste kunna välja vilka todolistor man
  // vill dela, alla eller bara en eller några".
  const [exportSelection, setExportSelection] = useState<Set<string>>(
    () => new Set([CHILDREN_FILTER_ID, NO_CATEGORY_FILTER_ID, ...myCategories.map((c) => c.id)])
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
    downloadCsv("todo-mall.csv", buildTemplateCsv());
  }

  function handleExport() {
    const included = todos.filter((todo) => {
      const assignee = members.find((m) => m.id === todo.assignedTo);
      if (assignee?.isChild) return exportSelection.has(CHILDREN_FILTER_ID);
      return todo.personalCategoryId
        ? exportSelection.has(todo.personalCategoryId)
        : exportSelection.has(NO_CATEGORY_FILTER_ID);
    });
    downloadCsv("mina-todos.csv", todosToCsv(included, members, currentMember.id));
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
      const undoUpdated: ImportUndo["updated"] = [];
      const undoCreatedIds: Id[] = [];

      for (const row of rows) {
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
            const category = await onCreateCategory(row.newCategoryName);
            createdCategoryIds.set(key, category.id);
            categoryId = category.id;
          }
        }

        // Matchar mot en egen, ej raderad todo med samma Id — annars skapas en
        // ny (samma fallback som om Id-kolumnen saknas helt, t.ex. en mall).
        const existing = row.sourceId
          ? todos.find(
              (t) =>
                t.id === row.sourceId &&
                t.deletedAt === null &&
                (t.assignedTo === currentMember.id || t.createdBy === currentMember.id)
            )
          : undefined;

        if (existing) {
          undoUpdated.push({ id: existing.id, previous: extractPatchFields(existing) });
          onUpdateTodo(existing.id, buildUpdatePatch(row, categoryId));
          updated++;
        } else {
          const newTodo = buildNewTodo(row, currentMember.id, categoryId, assignedTo);
          undoCreatedIds.push(newTodo.id);
          onCreateTodo(newTodo);
          created++;
        }
      }

      setResult({ created, updated, errors: parseErrors });
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
    const { rows, errors } = parseTodoCsv(text, members, categories, currentMember.id);

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
        Exportera dina egna uppgifter till ett kalkylark, eller ladda ner en tom mall att fylla i och importera
        tillbaka. Både engångsuppgifter och återkommande mallar (med sina scheman) räknas med. Importerar du en fil
        som redan innehåller Id:n för dina egna uppgifter uppdateras de istället för att skapas som nya.
      </p>

      <fieldset className="todo-import-export__filter">
        <legend>Vad ska exporteras?</legend>
        <label>
          <input
            checked={exportSelection.has(CHILDREN_FILTER_ID)}
            onChange={() => toggleExportSelection(CHILDREN_FILTER_ID)}
            type="checkbox"
          />
          Barn
        </label>
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
          Exportera mina uppgifter (CSV)
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
