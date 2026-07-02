import type { RewardShopItem, ShopTimeInterval } from "@shared/types";
import { blockingCategories } from "@shared/rewardShopAvailability";

export { blockingCategories };

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function toTimeStr(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`; // "HH:MM"
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function daysUntil(dateStr: string, now: Date): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date(toDateStr(now) + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function inTimeInterval(interval: ShopTimeInterval, timeStr: string): boolean {
  return timeStr >= interval.start && timeStr <= interval.end;
}

// Hur många minuter är kvar av ett tidsintervall från och med nu
function minutesLeftInInterval(interval: ShopTimeInterval, now: Date): number {
  return toMinutes(interval.end) - toMinutes(toTimeStr(now));
}

// Nästa intervall (samma dag) som börjar efter nu OCH har tillräckligt med tid för timern
function nextUsableIntervalStart(
  intervals: ShopTimeInterval[],
  nowTime: string,
  timerMinutes: number | null
): string | null {
  const upcoming = intervals
    .filter((iv) => iv.start > nowTime)
    .filter((iv) => timerMinutes === null || toMinutes(iv.end) - toMinutes(iv.start) >= timerMinutes)
    .sort((a, b) => a.start.localeCompare(b.start));
  return upcoming[0]?.start ?? null;
}

/** Varans slutdatum har passerat → dölj den helt. */
export function isExpired(item: RewardShopItem, now = new Date()): boolean {
  const { availability } = item;
  if (!availability?.endDate) return false;
  return toDateStr(now) > availability.endDate;
}

/**
 * Varan är tillgänglig just nu — kontrollerar:
 * 1. Datum (startDate / endDate)
 * 2. Att vi befinner oss i ett tidsintervall
 * 3. Att det finns tillräckligt med tid kvar i intervallet för varans timer
 *
 * Regel: om timer = 60 min och intervallet stänger om 31 min → INTE tillgänglig,
 * för barnet hinner inte använda hela belöningen inom utsatt tid.
 */
export function isAvailableNow(item: RewardShopItem, now = new Date()): boolean {
  const { availability, timerMinutes } = item;
  if (!availability) return true;

  const today = toDateStr(now);

  if (availability.startDate && today < availability.startDate) return false;
  if (availability.endDate && today > availability.endDate) return false;

  if (availability.timeIntervals.length === 0) return true;

  const nowTime = toTimeStr(now);
  const activeInterval = availability.timeIntervals.find((iv) => inTimeInterval(iv, nowTime));
  if (!activeInterval) return false;

  // Timer-kontroll: finns det tillräckligt med tid kvar i intervallet?
  if (timerMinutes !== null) {
    const minutesLeft = minutesLeftInInterval(activeInterval, now);
    if (minutesLeft < timerMinutes) return false;
  }

  return true;
}

/**
 * Förklarande text när varan INTE är tillgänglig just nu.
 * Täcker fyra fall:
 * - Startdatum i framtiden → "5 dagar kvar"
 * - Utanför alla tidsintervall → "Tillgänglig kl 18:00"
 * - I ett intervall men för lite tid kvar för timern → "31 min kvar - behöver 60 min"
 * - Alla intervall passerade för idag → "Tillgänglig kl 07:00 imorgon"
 */
export function unavailableLabel(item: RewardShopItem, now = new Date()): string | null {
  const { availability, timerMinutes } = item;
  if (!availability) return null;
  if (isAvailableNow(item, now)) return null;

  const today = toDateStr(now);

  // Startdatum är i framtiden
  if (availability.startDate && today < availability.startDate) {
    const days = daysUntil(availability.startDate, now);
    return days === 1 ? "1 dag kvar" : `${days} dagar kvar`;
  }

  if (availability.timeIntervals.length > 0) {
    const nowTime = toTimeStr(now);
    const activeInterval = availability.timeIntervals.find((iv) => inTimeInterval(iv, nowTime));

    // Vi är inne i ett intervall men timern ryms inte
    if (activeInterval && timerMinutes !== null) {
      const minutesLeft = minutesLeftInInterval(activeInterval, now);
      return `${minutesLeft} min kvar - behöver ${timerMinutes} min`;
    }

    // Vi är utanför alla intervall - hitta nästa med tillräcklig tid
    const next = nextUsableIntervalStart(availability.timeIntervals, nowTime, timerMinutes);
    if (next) return `Tillgänglig kl ${next}`;

    // Alla intervall passerade för idag
    const firstUsable = [...availability.timeIntervals]
      .filter((iv) => timerMinutes === null || toMinutes(iv.end) - toMinutes(iv.start) >= timerMinutes)
      .sort((a, b) => a.start.localeCompare(b.start))[0]?.start;
    if (firstUsable) return `Tillgänglig kl ${firstUsable} imorgon`;
  }

  return "Ej tillgänglig just nu";
}

/**
 * Minuter kvar tills varan blir tillgänglig via sitt tidsfönster (startDatum eller
 * nästa lediga tidsintervall) — null om den redan är tillgänglig, om den saknar ett
 * tidsfönster (t.ex. bara kategori-spärrad), eller om nästa tillfälle inte går att
 * räkna ut (inget kommande intervall finns alls). Används för att visa "snart
 * tillgänglig"-toning istället för att dölja varan helt.
 */
export function minutesUntilAvailable(item: RewardShopItem, now = new Date()): number | null {
  const { availability, timerMinutes } = item;
  if (!availability) return null;
  if (isAvailableNow(item, now)) return null;

  const today = toDateStr(now);

  if (availability.startDate && today < availability.startDate) {
    const startOfDay = new Date(`${availability.startDate}T00:00:00`);
    return Math.round((startOfDay.getTime() - now.getTime()) / 60_000);
  }

  if (availability.timeIntervals.length === 0) return null;

  const nowTime = toTimeStr(now);
  const next = nextUsableIntervalStart(availability.timeIntervals, nowTime, timerMinutes);
  if (next) {
    return toMinutes(next) - toMinutes(nowTime);
  }

  // Alla dagens intervall passerade — hitta första användbara imorgon
  const firstUsable = [...availability.timeIntervals]
    .filter((iv) => timerMinutes === null || toMinutes(iv.end) - toMinutes(iv.start) >= timerMinutes)
    .sort((a, b) => a.start.localeCompare(b.start))[0]?.start;
  if (!firstUsable) return null;

  const minutesLeftToday = 24 * 60 - toMinutes(nowTime);
  return minutesLeftToday + toMinutes(firstUsable);
}
