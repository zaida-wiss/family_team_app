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
  onCreateCategory: (name: string) => Promise<TodoCategory>;
};

function buildTodo(row: ParsedTodoRow, currentMemberId: Id, categoryId: Id | null): Todo {
  return {
    id: `todo-${generateId()}`,
    title: row.title,
    createdBy: currentMemberId,
    assignedTo: row.assignedTo,
    isShared: false,
    status: "pending",
    starValue: row.starValue,
    visual: { type: "lucide-icon", value: "Star" },
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
    personalCategoryId: categoryId,
    subtasks: row.subtasks.length > 0 ? row.subtasks : undefined,
    notes: row.notes
  };
}

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål) — en mall
// med samma rubriker som exporten/importen förväntar sig, så man kan fylla i
// den i valfritt kalkylarksprogram (Excel/Sheets/Numbers) och sedan importera
// tillbaka. Bara engångsuppgifter (ingen återkommelse, se todoCsv.ts).
export function TodoImportExport({
  currentMember,
  members,
  todos,
  categories,
  onCreateTodo,
  onCreateCategory
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  function handleDownloadTemplate() {
    downloadCsv("todo-mall.csv", buildTemplateCsv());
  }

  function handleExport() {
    downloadCsv("mina-todos.csv", todosToCsv(todos, members, currentMember.id));
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      const { rows, errors } = parseTodoCsv(text, members, categories, currentMember.id);

      // Cachar nyskapade kategorinamn under importen så flera rader med
      // samma nya kategori inte skapar en dubblett var.
      const createdCategoryIds = new Map<string, Id>();
      let created = 0;

      for (const row of rows) {
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
        onCreateTodo(buildTodo(row, currentMember.id, categoryId));
        created++;
      }

      setResult({ created, errors });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="todo-import-export">
      <p className="todo-import-export__intro">
        Exportera dina egna uppgifter till ett kalkylark, eller ladda ner en tom mall att fylla i och importera tillbaka.
        Bara engångsuppgifter stöds (inga återkommande scheman).
      </p>

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

      {result && (
        <div className="todo-import-export__result" role="status">
          <p>{result.created} {result.created === 1 ? "uppgift" : "uppgifter"} importerade.</p>
          {result.errors.length > 0 && (
            <ul className="todo-import-export__errors">
              {result.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
