import "./ShoppingImportExport.css";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { downloadCsv } from "../todos/todoCsv";
import { buildShoppingTemplateCsv, parseShoppingCsv, shoppingListsToCsv } from "./shoppingCsv";
import type { Id, ShoppingList } from "@shared/types";

type Props = {
  shoppingLists: ShoppingList[];
  onImport: (rows: { listName: string; title: string; done: boolean }[], memberId: Id) => Promise<void>;
  currentMemberId: Id;
};

// Massimport/-export av inköpslistor via kalkylark (2026-07-28, Zaidas
// önskemål) — samma "en liten sektion i panelen"-mönster som
// RecipeImportExport.tsx.
export function ShoppingImportExport({ shoppingLists, onImport, currentMemberId }: Props) {
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
      const { rows, errors } = parseShoppingCsv(text);
      await onImport(rows, currentMemberId);
      setResultMessage(
        errors.length > 0
          ? `${rows.length} varor importerade. ${errors.length} rad(er) hoppades över: ${errors.join(" ")}`
          : `${rows.length} varor importerade.`
      );
    } catch {
      setResultMessage("Kunde inte läsa filen — kontrollera att den är en giltig CSV-export.");
    } finally {
      setImporting(false);
    }
  }

  const hasItems = shoppingLists.some((l) => l.deletedAt === null && l.items.some((i) => i.deletedAt === null));

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">📥 Importera/exportera varor</h3>
      <p className="settings-sub-desc">
        En rad per vara. Okända listnamn skapas automatiskt vid import.
      </p>
      <div className="shopping-import-export">
        <button className="secondary-button" onClick={() => downloadCsv("inkopslistor-mall.csv", buildShoppingTemplateCsv())} type="button">
          <Download size={14} /> Ladda ner mall (CSV)
        </button>
        <button
          className="secondary-button"
          disabled={!hasItems}
          onClick={() => downloadCsv("mina-inkopslistor.csv", shoppingListsToCsv(shoppingLists))}
          type="button"
        >
          <Download size={14} /> Exportera mina inköpslistor (CSV)
        </button>
        <button className="secondary-button" disabled={importing} onClick={() => fileInputRef.current?.click()} type="button">
          <Upload size={14} /> {importing ? "Importerar…" : "Importera från CSV"}
        </button>
        <input
          accept=".csv"
          aria-label="Importera inköpslistor från CSV-fil"
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
