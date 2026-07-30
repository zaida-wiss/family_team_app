// Delad stale-while-revalidate-cache (2026-07-17, Zaidas önskemål: "allt ska
// vara i local storage" — barnen kunde inte se sina uppgifter, kalendrar
// eller todos utan nät). Samma mönster som useCalendarsState.ts redan
// använde för kalendrar (enda stället i kodbasen med den här sortens cache
// innan detta), nu generaliserat till en delad, beroendefri hjälpare istället
// för att duplicera read/write-paret i varje state-hook. Läser cachad data
// synkront vid mount (visas direkt, ingen tom laddningsvy), skriver över
// cachen varje gång ny data hämtas ELLER en lokal (optimistisk) ändring görs
// — så en ändring gjord precis innan nätet försvann också överlever en
// sidomladdning, inte bara redan hämtad serverdata.
//
// Kontoscopning (2026-07-30, Zaidas önskemål om att hemvyns familjeväxling
// ska visa RÄTT familjs delade inköpslistor/todos/kalendrar/medlemmar) —
// tidigare var alla 11 cache-nycklar GLOBALA (samma "todos_v1" oavsett vilket
// konto), ett känt men tidigare oåtgärdat fynd (se CLAUDE.md 2026-07-29): ett
// familjebyte kunde kort visa FÖREGÅENDE familjs cachade data innan den
// färska hämtningen hann skriva över den. Löst med ett litet, modulnivå-
// namnrymdsprefix istället för att tråda accountId genom alla 11 hookars
// signaturer — AppRouter.tsx anropar setCacheNamespace(accountId) SYNKRONT i
// sin render-funktion (inte i en effekt) varje gång activeMembership byts,
// vilket alltid hinner köra INNAN Shell-trädets barn monteras och läser sin
// egen useState(() => readCache(...))-initiering, eftersom React kör en
// förälders render-funktion färdigt innan den monterar barnen.
let cacheNamespace = "";

export function setCacheNamespace(namespace: string): void {
  cacheNamespace = namespace;
}

function scopedKey(key: string): string {
  return cacheNamespace ? `${cacheNamespace}:${key}` : key;
}

export function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(scopedKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(scopedKey(key), JSON.stringify(data));
  } catch {
    // Full lagringskvot eller privat läge — ofarligt att bara hoppa över,
    // appen fungerar precis som innan denna cache fanns.
  }
}
