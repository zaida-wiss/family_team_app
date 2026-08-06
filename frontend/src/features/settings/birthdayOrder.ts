// Födelsedagslista (2026-08-06) — sortering "vem fyller år näst", ren
// klientsidig beräkning (samma princip som Todo-mallars återkommelse-
// beskrivning, se recurringTodos.ts:s describeRecurrence). Räknar i LOKAL
// tid (enhetens egna Date-getters), inte UTC — samma "isoToDateOnly"-lärdom
// som redan gäller CSV-import/export på flera ställen i appen.

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Nästa förekomst av (month, day) från och med idag (idag räknas som "näst"
// om det är samma datum) — 29 februari i ett icke-skottår rullar naturligt
// över till 1 mars via JS's egen Date-normalisering, ingen särskild
// skottårshantering byggd.
export function nextOccurrence(month: number, day: number, today: Date = new Date()): Date {
  const base = startOfLocalDay(today);
  const thisYear = new Date(base.getFullYear(), month - 1, day);
  return thisYear >= base ? thisYear : new Date(base.getFullYear() + 1, month - 1, day);
}

export function daysUntilNextOccurrence(month: number, day: number, today: Date = new Date()): number {
  const base = startOfLocalDay(today);
  const next = nextOccurrence(month, day, today);
  return Math.round((next.getTime() - base.getTime()) / 86_400_000);
}

// Åldern personen fyller vid NÄSTA förekomst — null om inget födelseår är
// angivet.
export function turningAge(year: number | null, month: number, day: number, today: Date = new Date()): number | null {
  if (year === null) return null;
  const next = nextOccurrence(month, day, today);
  return next.getFullYear() - year;
}

export function sortByUpcomingBirthday<T extends { name: string; month: number; day: number }>(
  items: T[],
  today: Date = new Date()
): T[] {
  return [...items].sort((a, b) => {
    const diff = daysUntilNextOccurrence(a.month, a.day, today) - daysUntilNextOccurrence(b.month, b.day, today);
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "sv");
  });
}
