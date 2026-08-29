import type { Id, RewardShopItem, TodoCategory } from "@shared/types";
import { csvField, downloadCsv, parseCsvText, toCsvRow } from "../todos/todoCsv";
import { generateId } from "../../utils/uuid";

// Import/export av belöningsbutikens katalog via kalkylark (2026-07-29, del
// av Zaidas önskemål "all data ska gå att importera och exportera i de
// olika kategorierna i inställningar") — samma minimala RFC4180-parser som
// todos/recept/inköpslistor redan skrivit, återanvänd rakt av. En rad = en
// belöning. `Tillgänglighet` (datumfönster + tidsfönster, RewardShopItem.
// availability) och `Köpgräns` (max antal per period, RewardShopItem.
// purchaseLimit, 2026-08-29) är MEDVETET UTESLUTNA — för komplexa för en
// kalkylarksrad, samma avvägning som redan gjorts för todos flera
// tidsintervall/recepts bilder. En importerad/uppdaterad vara får därför
// alltid `availability: null`/`purchaseLimit: null` (alltid tillgänglig,
// obegränsat antal) — måste sättas separat i Belöningsbutiken-
// inställningarna om en begränsning behövs.
export const REWARD_CSV_HEADERS = ["Titel", "Emoji", "Stjärnkostnad", "Timer (min)", "Kategorier", "Id"] as const;

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

export function buildRewardShopTemplateCsv(): string {
  const header = toCsvRow([...REWARD_CSV_HEADERS]);
  const example = toCsvRow(["Extra godis", "🍬", "10", "", "", ""]);
  return `${header}\n${example}\n`;
}

export function rewardShopItemsToCsv(items: RewardShopItem[], categories: TodoCategory[]): string {
  const rows = items
    .filter((item) => item.deletedAt === null)
    .map((item) => {
      const categoryNames = item.requiredCategories
        .map((id) => categories.find((c) => c.id === id)?.name)
        .filter((name): name is string => !!name)
        .join(", ");
      return toCsvRow([
        item.title,
        item.symbol ?? "",
        String(item.starCost),
        item.timerMinutes !== null ? String(item.timerMinutes) : "",
        categoryNames,
        item.id
      ]);
    });
  return `${toCsvRow([...REWARD_CSV_HEADERS])}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

export type ParsedRewardRow = {
  id: Id | null;
  title: string;
  symbol: string | null;
  starCost: number;
  timerMinutes: number | null;
  categoryNames: string[];
};

export function parseRewardShopCsv(text: string): { rows: ParsedRewardRow[]; errors: string[] } {
  const lines = parseCsvText(text);
  if (lines.length === 0) return { rows: [], errors: [] };

  const header = lines[0].map((h) => h.trim());
  const colIndex = (name: string) => header.indexOf(name);
  const titleIdx = colIndex("Titel");
  const emojiIdx = colIndex("Emoji");
  const costIdx = colIndex("Stjärnkostnad");
  const timerIdx = colIndex("Timer (min)");
  const categoriesIdx = colIndex("Kategorier");
  const idIdx = colIndex("Id");

  const rows: ParsedRewardRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.every((c) => c.trim() === "")) continue;
    const rowNum = i + 1;

    const title = (titleIdx !== -1 ? cells[titleIdx] : "").trim();
    if (!title) {
      errors.push(`Rad ${rowNum}: Titel saknas, hoppar över.`);
      continue;
    }

    const rawEmoji = (emojiIdx !== -1 ? cells[emojiIdx] : "").trim();
    const symbol = rawEmoji && EMOJI_PATTERN.test(rawEmoji) ? rawEmoji : null;

    const rawCost = (costIdx !== -1 ? cells[costIdx] : "").trim();
    const starCost = rawCost ? Number(rawCost) : 0;
    if (rawCost && (Number.isNaN(starCost) || starCost < 0)) {
      errors.push(`Rad ${rowNum}: Ogiltig stjärnkostnad "${rawCost}", hoppar över.`);
      continue;
    }

    const rawTimer = (timerIdx !== -1 ? cells[timerIdx] : "").trim();
    let timerMinutes: number | null = null;
    if (rawTimer) {
      const parsed = Number(rawTimer);
      if (Number.isNaN(parsed) || parsed <= 0) {
        errors.push(`Rad ${rowNum}: Ogiltig timer "${rawTimer}", ignoreras.`);
      } else {
        timerMinutes = parsed;
      }
    }

    const categoryNames = (categoriesIdx !== -1 ? cells[categoriesIdx] : "")
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    const id = idIdx !== -1 && cells[idIdx].trim() ? cells[idIdx].trim() : null;

    rows.push({ id, title, symbol, starCost, timerMinutes, categoryNames });
  }

  return { rows, errors };
}

// Matchar Kategorier-cellens fria namn mot BEFINTLIGA kategorier
// (skiftlägesokänsligt) — skapar INTE nya kategorier automatiskt, till
// skillnad från todos-importen. En belöningsbutiks kategori-spärr är en
// säkerhetsgräns (vilka uppgifter ett barn måste klara för att låsa upp en
// vara), inte bara en fri etikett — okända namn hoppas över med ett tydligt
// fel istället för att gissa fram en ny kategori.
export function resolveRewardCategoryIds(
  categoryNames: string[],
  categories: TodoCategory[]
): { ids: Id[]; unknown: string[] } {
  const ids: Id[] = [];
  const unknown: string[] = [];
  for (const name of categoryNames) {
    const match = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (match) ids.push(match.id);
    else unknown.push(name);
  }
  return { ids, unknown };
}

export function newRewardShopItemId(): Id {
  return `reward-${generateId()}`;
}

export { downloadCsv, csvField };
