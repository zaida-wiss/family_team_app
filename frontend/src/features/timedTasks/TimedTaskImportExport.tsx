import "./TimedTaskImportExport.css";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { downloadCsv } from "../todos/todoCsv";
import { buildTimedTaskTemplateCsv, DEFAULT_SYMBOL, parseTimedTaskCsv, resolveChildId, timedTasksToCsv } from "./timedTaskCsv";
import type { Member, TimedTaskWithBest } from "@shared/types";

type Props = {
  timedTasks: TimedTaskWithBest[];
  children: Member[];
  onCreate: (title: string, symbol: string | null, assignedTo: string) => void;
};

// Massimport/-export av Medaljer/Rekord-uppgifter via kalkylark (2026-07-29,
// del av Zaidas önskemål "all data ska gå att importera och exportera i de
// olika kategorierna i inställningar") — samma "en liten sektion i
// panelen"-mönster som övriga import/export-komponenter denna session.
// Ingen "buntning" behövs här (till skillnad från todos/recept/inköpslistor/
// belöningar) — TimedTask-listan är typiskt mycket kort (en handfull
// tidtagna aktiviteter per barn), och onCreate är redan fire-and-forget.
export function TimedTaskImportExport({ timedTasks, children, onCreate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setResultMessage(null);
    try {
      const text = await file.text();
      const { rows, errors } = parseTimedTaskCsv(text);
      const rowErrors = [...errors];
      let created = 0;

      for (const row of rows) {
        const childId = resolveChildId(row.childName, children);
        if (!childId) {
          rowErrors.push(`"${row.title}": okänt barn "${row.childName}", hoppar över.`);
          continue;
        }
        onCreate(row.title, row.symbol ?? DEFAULT_SYMBOL, childId);
        created++;
      }

      setResultMessage(
        rowErrors.length > 0
          ? `${created} nya uppgifter. ${rowErrors.length} rad(er) hoppades över: ${rowErrors.join(" ")}`
          : `${created} nya uppgifter.`
      );
    } catch {
      setResultMessage("Kunde inte läsa filen — kontrollera att den är en giltig CSV-export.");
    } finally {
      setImporting(false);
    }
  }

  const hasItems = timedTasks.some((t) => t.deletedAt === null);

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">📥 Importera/exportera</h3>
      <p className="settings-sub-desc">
        En rad per uppgift. Barnet måste redan finnas i familjen — matchas mot namnet, skapas inte
        automatiskt. Själva de tidtagna försöken/rekorden ingår inte, bara uppgifterna.
      </p>
      <div className="timed-task-import-export">
        <button
          className="secondary-button"
          onClick={() => downloadCsv("medaljer-rekord-mall.csv", buildTimedTaskTemplateCsv())}
          type="button"
        >
          <Download size={14} /> Ladda ner mall (CSV)
        </button>
        <button
          className="secondary-button"
          disabled={!hasItems}
          onClick={() => downloadCsv("mina-medaljer-rekord.csv", timedTasksToCsv(timedTasks, children))}
          type="button"
        >
          <Download size={14} /> Exportera uppgifter (CSV)
        </button>
        <button className="secondary-button" disabled={importing} onClick={() => fileInputRef.current?.click()} type="button">
          <Upload size={14} /> {importing ? "Importerar…" : "Importera från CSV"}
        </button>
        <input
          accept=".csv"
          aria-label="Importera Medaljer/Rekord-uppgifter från CSV-fil"
          onChange={handleFileChange}
          ref={fileInputRef}
          style={{ display: "none" }}
          type="file"
        />
        {resultMessage && <p className="empty-note">{resultMessage}</p>}
      </div>
    </div>
  );
}
