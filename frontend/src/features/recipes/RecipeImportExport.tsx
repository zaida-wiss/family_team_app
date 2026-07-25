import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { buildRecipeTemplateCsv, downloadCsv, parseRecipeCsv, recipesToCsv } from "./recipeCsv";
import type { Recipe } from "@shared/types";

type Props = {
  recipes: Recipe[];
  onImport: (rows: ReturnType<typeof parseRecipeCsv>) => Promise<void>;
};

// Massimport/-export av recept via kalkylark (2026-07-25, Zaidas önskemål) —
// samma "en liten sektion i panelen"-mönster som TodoImportExport.tsx i
// Inställningar, fast här direkt i Recept-panelen.
export function RecipeImportExport({ recipes, onImport }: Props) {
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
      const rows = parseRecipeCsv(text);
      await onImport(rows);
      setResultMessage(`${rows.length} recept importerade/uppdaterade.`);
    } catch {
      setResultMessage("Kunde inte läsa filen — kontrollera att den är en giltig CSV-export.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="recipe-import-export">
      <button className="secondary-button" onClick={() => downloadCsv("recept-mall.csv", buildRecipeTemplateCsv())} type="button">
        <Download size={14} /> Ladda ner mall (CSV)
      </button>
      <button
        className="secondary-button"
        disabled={recipes.length === 0}
        onClick={() => downloadCsv("mina-recept.csv", recipesToCsv(recipes))}
        type="button"
      >
        <Download size={14} /> Exportera mina recept (CSV)
      </button>
      <button className="secondary-button" disabled={importing} onClick={() => fileInputRef.current?.click()} type="button">
        <Upload size={14} /> {importing ? "Importerar…" : "Importera från CSV"}
      </button>
      <input
        accept=".csv"
        aria-label="Importera recept från CSV-fil"
        onChange={handleFileChange}
        ref={fileInputRef}
        style={{ display: "none" }}
        type="file"
      />
      {resultMessage && <p className="empty-note">{resultMessage}</p>}
    </div>
  );
}
