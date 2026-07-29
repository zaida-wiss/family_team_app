import "./RewardShopImportExport.css";
import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { downloadCsv } from "../todos/todoCsv";
import {
  buildRewardShopTemplateCsv,
  newRewardShopItemId,
  parseRewardShopCsv,
  resolveRewardCategoryIds,
  rewardShopItemsToCsv
} from "./rewardShopCsv";
import type { Id, RewardShopItem, TodoCategory } from "@shared/types";

type ItemPatch = Partial<Pick<RewardShopItem, "title" | "symbol" | "starCost" | "timerMinutes" | "requiredCategories">>;

type Props = {
  items: RewardShopItem[];
  categories: TodoCategory[];
  currentMemberId: Id;
  onAdd: (item: RewardShopItem) => void;
  onUpdate: (itemId: Id, patch: ItemPatch) => void;
};

// Massimport/-export av belöningsbutikens katalog via kalkylark (2026-07-29,
// del av Zaidas önskemål "all data ska gå att importera och exportera i de
// olika kategorierna i inställningar") — samma "en liten sektion i
// panelen"-mönster som ShoppingImportExport.tsx/RecipeImportExport.tsx.
// Skrivningar buntas i grupper om 4 med paus emellan (ADR-0023-mönstret) —
// samma skäl som todos/recept/inköpslistors import: undvik en rate-limit-
// topp vid en stor import.
export function RewardShopImportExport({ items, categories, currentMemberId, onAdd, onUpdate }: Props) {
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
      const { rows, errors } = parseRewardShopCsv(text);
      const rowErrors = [...errors];
      let created = 0;
      let updated = 0;

      for (let i = 0; i < rows.length; i += 4) {
        const batch = rows.slice(i, i + 4);
        for (const row of batch) {
          const { ids, unknown } = resolveRewardCategoryIds(row.categoryNames, categories);
          if (unknown.length > 0) {
            rowErrors.push(`"${row.title}": okänd kategori (${unknown.join(", ")}), ignoreras.`);
          }
          const existing = row.id ? items.find((it) => it.id === row.id && it.deletedAt === null) : null;
          if (existing) {
            onUpdate(existing.id, {
              title: row.title,
              symbol: row.symbol,
              starCost: row.starCost,
              timerMinutes: row.timerMinutes,
              requiredCategories: ids
            });
            updated++;
          } else {
            onAdd({
              id: newRewardShopItemId(),
              title: row.title,
              symbol: row.symbol,
              starCost: row.starCost,
              timerMinutes: row.timerMinutes,
              availability: null,
              requiredCategories: ids,
              createdBy: currentMemberId,
              deletedAt: null
            });
            created++;
          }
        }
        if (i + 4 < rows.length) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }

      setResultMessage(
        rowErrors.length > 0
          ? `${created} nya, ${updated} uppdaterade. ${rowErrors.length} anmärkning(ar): ${rowErrors.join(" ")}`
          : `${created} nya, ${updated} uppdaterade.`
      );
    } catch {
      setResultMessage("Kunde inte läsa filen — kontrollera att den är en giltig CSV-export.");
    } finally {
      setImporting(false);
    }
  }

  const hasItems = items.some((i) => i.deletedAt === null);

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">📥 Importera/exportera</h3>
      <p className="settings-sub-desc">
        En rad per belöning. Kategorier matchas mot dina redan befintliga (skapas inte automatiskt).
        Tillgänglighet (datum/tider) ingår inte — sätts separat här i Belöningsbutiken efteråt.
      </p>
      <div className="reward-shop-import-export">
        <button
          className="secondary-button"
          onClick={() => downloadCsv("belonings-mall.csv", buildRewardShopTemplateCsv())}
          type="button"
        >
          <Download size={14} /> Ladda ner mall (CSV)
        </button>
        <button
          className="secondary-button"
          disabled={!hasItems}
          onClick={() => downloadCsv("min-belonings-butik.csv", rewardShopItemsToCsv(items, categories))}
          type="button"
        >
          <Download size={14} /> Exportera belöningar (CSV)
        </button>
        <button className="secondary-button" disabled={importing} onClick={() => fileInputRef.current?.click()} type="button">
          <Upload size={14} /> {importing ? "Importerar…" : "Importera från CSV"}
        </button>
        <input
          accept=".csv"
          aria-label="Importera belöningar från CSV-fil"
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
