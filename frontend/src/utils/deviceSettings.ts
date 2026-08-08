// Enhetsspecifika inställningar (2026-08-10, Zaidas önskemål: "På varje
// enhet behöver man kunna ställa in sin egen textstorlek"/"avstånd mellan
// bollarna och bollarnas storlek behöver vara kopplad till en specifik
// enhet") — sparas i webbläsarens EGEN localStorage, delas ALDRIG mellan
// enheter och synkas ALDRIG till kontot, till skillnad från Member-fält som
// textSize/todoThreadGap/todoBubbleSize (som fortsatt finns kvar som
// utgångsvärde för en helt ny enhet utan egen override, se useDeviceSetting).
const PREFIX = "device-setting:";

export function getDeviceSetting<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setDeviceSetting<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // t.ex. privat läge/full lagring — ofarligt att bara inte spara.
  }
}

export function clearDeviceSetting(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // se ovan.
  }
}
