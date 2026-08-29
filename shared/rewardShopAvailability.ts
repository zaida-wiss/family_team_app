import type { Id, PurchaseLimitPeriod, RewardShopItem, ShopAvailabilityWindow, ShopTimeInterval, Todo, Weekday } from "./types.js";

// Familjens hemtidszon (samma konstant som frontend/src/utils/fixedTimeZone.ts,
// duplicerad hellre än importerad — shared/ ska inte bero på frontend-kod).
// isAvailableNow() nedan körs på BÅDA sidor (klienten för UI-dimning/dölj,
// servern som den auktoritativa spärren vid köp, se rewardShopService.ts) —
// utan en fast tidszon skulle en server som kör i UTC (t.ex. Render) och en
// webbläsare i Sverige (UTC+1/+2) kunna komma fram till OLIKA svar nära en
// dygns- eller veckodagsgräns. "Vilka veckodagar/tider" en belöning gäller är
// ett hushållsschema-koncept, inte "enhetens råkade tidszon just nu".
const HOME_TIME_ZONE = "Europe/Stockholm";

function stockholmParts(date: Date): { dateStr: string; timeStr: string; weekday: Weekday } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: HOME_TIME_ZONE,
      hourCycle: "h23",
      weekday: "long",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    }).formatToParts(date).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    timeStr: `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday.toLowerCase() as Weekday
  };
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function inTimeInterval(interval: ShopTimeInterval, timeStr: string): boolean {
  return timeStr >= interval.start && timeStr <= interval.end;
}

function windowMatchesWeekday(window: ShopAvailabilityWindow, weekday: Weekday): boolean {
  return window.daysOfWeek.length === 0 || window.daysOfWeek.includes(weekday);
}

/**
 * Är varan tillgänglig just nu — datum, veckodag och tidsintervall, alltid
 * utvärderat i familjens hemtidszon (se HOME_TIME_ZONE ovan), oavsett vilken
 * tidszon den anropande processen själv befinner sig i.
 *
 * `availability.windows` (2026-08-29) — varan är tillgänglig om NÅGOT fönster
 * matchar dagens veckodag OCH (om fönstret har tidsintervall) nuvarande tid.
 * Ett tomt daysOfWeek i ett fönster betyder "alla dagar" för just det
 * fönstret; ett tomt timeIntervals betyder "hela dagen".
 *
 * Den AUKTORITATIVA spärren — anropas server-side i purchaseItem()
 * (rewardShopService.ts) så att ett köp inte längre kan kringgås genom att
 * anropa köp-endpointen direkt förbi UI:t (2026-08-28, Sprint 10 S1).
 * Frontend (shopAvailability.ts) importerar och återanvänder SAMMA funktion
 * för att dimma/dölja knappen — en enda källa till sanning för själva
 * ja/nej-svaret. De förklarande texterna ("Tillgänglig kl 18:00" osv, bara
 * UI-kosmetik) räknas separat, client-side, på enhetens egen lokala tid.
 */
export function isAvailableNow(item: RewardShopItem, now = new Date()): boolean {
  const { availability, timerMinutes } = item;
  if (!availability) return true;

  const { dateStr: today, timeStr: nowTime, weekday } = stockholmParts(now);

  if (availability.startDate && today < availability.startDate) return false;
  if (availability.endDate && today > availability.endDate) return false;

  if (availability.windows.length === 0) return true;

  const matching = availability.windows.filter((w) => windowMatchesWeekday(w, weekday));
  if (matching.length === 0) return false;

  // Ett fönster utan egna tidsintervall täcker hela dagen — inget att räkna ut.
  if (matching.some((w) => w.timeIntervals.length === 0)) return true;

  const intervals = matching.flatMap((w) => w.timeIntervals);
  const activeInterval = intervals.find((iv) => inTimeInterval(iv, nowTime));
  if (!activeInterval) return false;

  // Timer-kontroll: finns det tillräckligt med tid kvar i intervallet?
  if (timerMinutes !== null) {
    const minutesLeft = toMinutes(activeInterval.end) - toMinutes(nowTime);
    if (minutesLeft < timerMinutes) return false;
  }

  return true;
}

/** Dagens datum i familjens hemtidszon, "YYYY-MM-DD" — se HOME_TIME_ZONE ovan. */
export function toStockholmDateStr(date: Date): string {
  return stockholmParts(date).dateStr;
}

function mondayOfIsoWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=sön..6=lör
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Räknas två (redan hemtidszon-uttryckta) "YYYY-MM-DD"-datum till samma
 * period för en köpgräns (RewardShopItem.purchaseLimit)? "week" räknas
 * måndag–söndag. Ren kalenderjämförelse, ingen tidszonsomräkning kvar här —
 * anroparen (rewardShopService.ts) förväntas redan ha omvandlat varje
 * purchasedAt-tidsstämpel via toStockholmDateStr().
 */
export function isSamePurchasePeriod(dateStrA: string, dateStrB: string, period: PurchaseLimitPeriod): boolean {
  if (period === "day") return dateStrA === dateStrB;
  if (period === "month") return dateStrA.slice(0, 7) === dateStrB.slice(0, 7);
  return mondayOfIsoWeek(dateStrA) === mondayOfIsoWeek(dateStrB);
}

/**
 * Vilka av varans obligatoriska kategorier som fortfarande blockerar köpet.
 *
 * Regel: bara uppgifter som VISAS PÅ DASHBOARDEN JUST NU blockerar.
 * Ett uppdrag som missades igår eller vars tidsfönster (visibleFrom/expiresAt)
 * har passerat räknas inte — det syns inte på dashboarden och ska inte spela roll.
 *
 * requireApproval=true  → barnet måste ha fått uppgiften godkänd av förälder (status=approved)
 * requireApproval=false → det räcker att barnet markerat den som avklarad (status ≠ pending)
 *
 * Ren epoch-ms-jämförelse (from/until) — tidszonsoberoende, säker att köra på både
 * klient och server oavsett vilken tidszon respektive process kör i.
 */
export function blockingCategories(
  item: RewardShopItem,
  todos: Todo[],
  childId: Id,
  requireApproval = false,
  now = Date.now()
): Id[] {
  if ((item.requiredCategories ?? []).length === 0) return [];

  const unresolved = new Set(
    todos
      .filter((t) => {
        if (t.assignedTo !== childId) return false;
        if (t.deletedAt !== null) return false;
        if (!t.personalCategoryId) return false;
        if (!item.requiredCategories.includes(t.personalCategoryId)) return false;

        const from = t.visibleFrom ? new Date(t.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
        const until = t.expiresAt ? new Date(t.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        if (!(from <= now && now < until)) return false;

        return requireApproval ? t.status !== "approved" : t.status === "pending";
      })
      .map((t) => t.personalCategoryId as Id)
  );

  return [...unresolved];
}
