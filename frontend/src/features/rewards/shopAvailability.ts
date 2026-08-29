import type { RewardShopItem, ShopAvailabilityWindow, ShopTimeInterval, Weekday } from "@shared/types";
import { blockingCategories, isAvailableNow } from "@shared/rewardShopAvailability";

// isAvailableNow (den faktiska ja/nej-spärren, hemtidszon-baserad) flyttades
// 2026-08-28 till shared/ så EXAKT samma funktion kan köras server-side vid
// köp (purchaseItem, rewardShopService.ts) — se den filens kommentar.
// Re-exporteras här så alla befintliga importer (`from "../rewards/
// shopAvailability"`) i resten av rewards-featuren förblir oförändrade.
export { blockingCategories, isAvailableNow };

// WEEKDAY_BY_DAY_INDEX/intervalsForWeekday nedan används BARA av de
// förklarande texterna (unavailableLabel/minutesUntilAvailable) — enhetens
// egen lokala tid, inte hemtidszonen. Ren UI-kosmetik (t.ex. "Tillgänglig:
// lör, sön"), skiljer sig medvetet från den delade, hemtidszon-baserade
// isAvailableNow() ovan som avgör den FAKTISKA spärren — kan i sällsynta fall
// (familjen reser) ge en text som inte stämmer millimeterexakt med spärren,
// men det är bara en kosmetisk avvikelse, ingen säkerhets-/dataintegritetsfråga.
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

// Tidsintervall som gäller för en given veckodag, sammanslaget över alla
// fönster som täcker den dagen — null om INGET fönster täcker dagen alls
// (veckodagsspärr), tom array om något fönster täcker HELA dagen.
function intervalsForWeekday(windows: ShopAvailabilityWindow[], weekday: Weekday): ShopTimeInterval[] | null {
  const matching = windows.filter((w) => w.daysOfWeek.length === 0 || w.daysOfWeek.includes(weekday));
  if (matching.length === 0) return null;
  if (matching.some((w) => w.timeIntervals.length === 0)) return [];
  return matching.flatMap((w) => w.timeIntervals);
}

// Unionen av alla veckodagar som täcks av NÅGOT fönster, måndag-till-söndag-ordning.
function allowedWeekdaysUnion(windows: ShopAvailabilityWindow[]): Weekday[] {
  if (windows.some((w) => w.daysOfWeek.length === 0)) return [...WEEKDAY_DISPLAY_ORDER];
  const set = new Set<Weekday>();
  windows.forEach((w) => w.daysOfWeek.forEach((d) => set.add(d)));
  return WEEKDAY_DISPLAY_ORDER.filter((d) => set.has(d));
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

/**
 * Beskriver varans schema deklarativt — "NÄR är den möjlig att köpa" — oavsett
 * om den råkar vara inom fönstret just nu eller inte (2026-08-29, Zaidas
 * önskemål: en spärrad vara ska visa BÅDE när den går att köpa OCH vad som
 * krävs, inte bara det senare). Skiljer sig från unavailableLabel() ovan, som
 * bara ger en "nästa tillfälle om N minuter"-räkning när tiden FAKTISKT är
 * den aktiva spärren just nu — den här funktionen svarar oavsett anledning.
 * null om varan saknar tidsbegränsning helt (alltid tillgänglig tidsmässigt).
 */
export function describeAvailabilityWindow(item: RewardShopItem): string | null {
  const { availability } = item;
  if (!availability) return null;
  const { windows, startDate, endDate } = availability;
  if (windows.length === 0 && !startDate && !endDate) return null;

  const parts: string[] = [];

  if (windows.length > 0) {
    parts.push(
      windows
        .map((w) => {
          const days = w.daysOfWeek.length > 0
            ? WEEKDAY_DISPLAY_ORDER.filter((d) => w.daysOfWeek.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(", ")
            : "alla dagar";
          const times = w.timeIntervals.length > 0
            ? w.timeIntervals.map((iv) => `${iv.start}–${iv.end}`).join(", ")
            : null;
          return times ? `${days} kl ${times}` : days;
        })
        .join(" · ")
    );
  }
  if (startDate) parts.push(`från ${startDate}`);
  if (endDate) parts.push(`till ${endDate}`);

  return `Tillgänglig: ${parts.join(", ")}`;
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

  const windows = availability.windows;
  const todayWeekday = WEEKDAY_BY_DAY_INDEX[now.getDay()];
  const todayIntervals = intervalsForWeekday(windows, todayWeekday);

  if (todayIntervals === null) {
    const labels = allowedWeekdaysUnion(windows).map((d) => WEEKDAY_SHORT[d]);
    return `Tillgänglig: ${labels.join(", ")}`;
  }

  if (todayIntervals.length > 0) {
    const nowTime = toTimeStr(now);
    const activeInterval = todayIntervals.find((iv) => inTimeInterval(iv, nowTime));

    // Vi är inne i ett intervall men timern ryms inte
    if (activeInterval && timerMinutes !== null) {
      const minutesLeft = minutesLeftInInterval(activeInterval, now);
      return `${minutesLeft} min kvar - behöver ${timerMinutes} min`;
    }

    // Vi är utanför alla intervall - hitta nästa med tillräcklig tid
    const next = nextUsableIntervalStart(todayIntervals, nowTime, timerMinutes);
    if (next) return `Tillgänglig kl ${next}`;

    // Alla dagens intervall passerade — kolla imorgon (kan ha ANDRA fönster/tider)
    const tomorrowWeekday = WEEKDAY_BY_DAY_INDEX[(now.getDay() + 1) % 7];
    const tomorrowIntervals = intervalsForWeekday(windows, tomorrowWeekday);
    if (tomorrowIntervals !== null) {
      const firstUsable = tomorrowIntervals.length === 0
        ? "00:00"
        : [...tomorrowIntervals]
            .filter((iv) => timerMinutes === null || toMinutes(iv.end) - toMinutes(iv.start) >= timerMinutes)
            .sort((a, b) => a.start.localeCompare(b.start))[0]?.start;
      if (firstUsable) return `Tillgänglig kl ${firstUsable} imorgon`;
    }
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

  const windows = availability.windows;
  const todayWeekday = WEEKDAY_BY_DAY_INDEX[now.getDay()];
  const todayIntervals = intervalsForWeekday(windows, todayWeekday);

  // Veckodagsspärr har ingen enkel "nästa tillfälle om N minuter"-beräkning
  // (kan vara flera dagar bort) — visas bara som textlabel, ingen mjuk toning.
  if (todayIntervals === null) return null;
  // Ett fönster täcker redan hela dagen — skulle redan vara tillgänglig (se ovan).
  if (todayIntervals.length === 0) return null;

  const nowTime = toTimeStr(now);
  const next = nextUsableIntervalStart(todayIntervals, nowTime, timerMinutes);
  if (next) {
    return toMinutes(next) - toMinutes(nowTime);
  }

  // Alla dagens intervall passerade — hitta första användbara imorgon (kan ha ANDRA fönster/tider)
  const tomorrowWeekday = WEEKDAY_BY_DAY_INDEX[(now.getDay() + 1) % 7];
  const tomorrowIntervals = intervalsForWeekday(windows, tomorrowWeekday);
  if (tomorrowIntervals === null) return null;
  const firstUsable = tomorrowIntervals.length === 0
    ? "00:00"
    : [...tomorrowIntervals]
        .filter((iv) => timerMinutes === null || toMinutes(iv.end) - toMinutes(iv.start) >= timerMinutes)
        .sort((a, b) => a.start.localeCompare(b.start))[0]?.start;
  if (!firstUsable) return null;

  const minutesLeftToday = 24 * 60 - toMinutes(nowTime);
  return minutesLeftToday + toMinutes(firstUsable);
}
