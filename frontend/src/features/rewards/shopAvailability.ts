import type { RewardShopItem, ShopTimeInterval } from "@shared/types";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function toTimeStr(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`; // "HH:MM"
}

function daysUntil(dateStr: string, now: Date): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date(toDateStr(now) + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function inTimeInterval(interval: ShopTimeInterval, timeStr: string): boolean {
  return timeStr >= interval.start && timeStr <= interval.end;
}

function nextIntervalStart(intervals: ShopTimeInterval[], timeStr: string): string | null {
  // Hitta nästa interval som börjar efter nu (samma dag)
  const upcoming = intervals
    .map((iv) => iv.start)
    .filter((s) => s > timeStr)
    .sort();
  return upcoming[0] ?? null;
}

/** Varans slutdatum har passerat → dölj den helt. */
export function isExpired(item: RewardShopItem, now = new Date()): boolean {
  const { availability } = item;
  if (!availability?.endDate) return false;
  return toDateStr(now) > availability.endDate;
}

/** Varan är tillgänglig just nu (datum + klocktid stämmer). */
export function isAvailableNow(item: RewardShopItem, now = new Date()): boolean {
  const { availability } = item;
  if (!availability) return true;

  const today = toDateStr(now);

  // Datumfönster
  if (availability.startDate && today < availability.startDate) return false;
  if (availability.endDate && today > availability.endDate) return false;

  // Inga tidsintervall → tillgänglig hela dagen inom datumfönstret
  if (availability.timeIntervals.length === 0) return true;

  const nowTime = toTimeStr(now);
  return availability.timeIntervals.some((iv) => inTimeInterval(iv, nowTime));
}

/**
 * Returnerar en förklarande text när varan INTE är tillgänglig:
 * - "5 dagar kvar" om startdatum är i framtiden
 * - "Tillgänglig kl 18:00" om vi är utanför ett tidsintervall idag
 * - null om inga tillgänglighetsbegränsningar finns
 */
export function unavailableLabel(item: RewardShopItem, now = new Date()): string | null {
  const { availability } = item;
  if (!availability) return null;
  if (isAvailableNow(item, now)) return null;

  const today = toDateStr(now);

  // Startdatum är i framtiden
  if (availability.startDate && today < availability.startDate) {
    const days = daysUntil(availability.startDate, now);
    return days === 1 ? "1 dag kvar" : `${days} dagar kvar`;
  }

  // Vi är inom datumfönstret men utanför tidsintervall
  if (availability.timeIntervals.length > 0) {
    const nowTime = toTimeStr(now);
    const next = nextIntervalStart(availability.timeIntervals, nowTime);
    if (next) return `Tillgänglig kl ${next}`;

    // Alla interval för idag är passerade → nästa dag (om inget slutdatum)
    const firstStart = [...availability.timeIntervals].sort((a, b) =>
      a.start.localeCompare(b.start)
    )[0]?.start;
    if (firstStart) return `Tillgänglig kl ${firstStart} imorgon`;
  }

  return "Ej tillgänglig just nu";
}
