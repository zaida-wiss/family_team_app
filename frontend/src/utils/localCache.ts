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
export function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Full lagringskvot eller privat läge — ofarligt att bara hoppa över,
    // appen fungerar precis som innan denna cache fanns.
  }
}
