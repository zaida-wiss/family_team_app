import type { RewardShopItem, ShopTimeInterval, Weekday } from "@shared/types";
import { blockingCategories, isAvailableNow } from "@shared/rewardShopAvailability";

// isAvailableNow (den faktiska ja/nej-spärren, hemtidszon-baserad) flyttades
// 2026-08-28 till shared/ så EXAKT samma funktion kan köras server-side vid
// köp (purchaseItem, rewardShopService.ts) — se den filens kommentar.
// Re-exporteras här så alla befintliga importer (`from "../rewards/
// shopAvailability"`) i resten av rewards-featuren förblir oförändrade.
export { blockingCategories, isAvailableNow };

// isAllowedWeekday/WEEKDAY_BY_DAY_INDEX nedan används BARA av de förklarande
// texterna (unavailableLabel/minutesUntilAvailable) — enhetens egen lokala
// tid, inte hemtidszonen. Ren UI-kosmetik (t.ex. "Tillgänglig: lör, sön"),
// skiljer sig medvetet från den delade, hemtidszon-baserade isAvailableNow()
// ovan som avgör den FAKTISKA spärren — kan i sällsynta fall (familjen
// reser) ge en text som inte stämmer millimeterexakt med spärren, men det är
// bara en kosmetisk avvikelse, ingen säkerhets-/dataintegritetsfråga.
const WEEKDAY_BY_DAY_INDEX: Weekday[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
];

// Visningsordning (måndag först) + korta svenska etiketter för veckodags-hintar.
const WEEKDAY_DISPLAY_ORDER: Weekday[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
];

const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: "mån", tuesday: "tis", wednesday: "ons", thursday: "tors",
  friday: "fre", saturday: "lör", sunday: "sön"
};

function isAllowedWeekday(item: RewardShopItem, now: Date): boolean {
  const days = item.availability?.daysOfWeek;
  if (!days || days.length === 0) return true;
  return days.includes(WEEKDAY_BY_DAY_INDEX[now.getDay()]);
}

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

  if (!isAllowedWeekday(item, now)) {
    const labels = WEEKDAY_DISPLAY_ORDER
      .filter((d) => availability.daysOfWeek?.includes(d))
      .map((d) => WEEKDAY_SHORT[d]);
    return `Tillgänglig: ${labels.join(", ")}`;
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

  // Veckodagsspärr har ingen enkel "nästa tillfälle om N minuter"-beräkning
  // (kan vara flera dagar bort) — visas bara som textlabel, ingen mjuk toning.
  if (!isAllowedWeekday(item, now)) return null;

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
