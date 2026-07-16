// Tidszon-hjälpare för todo/rutin-klockslag (2026-07-16, Zaidas önskemål efter
// att familjen reste till Finland: "inte att de byter tid, utan är samma
// tider... eller om man vill välja att de ska vara en timme senare (som det
// blir nu på default)"). Två lägen, styrda av kontots Account.fixedTodoTimes:
//
// - false (standard, oförändrat beteende): ett klockslag tolkas/visas i
//   ENHETENS EGEN aktuella tidszon. Reser man till en annan tidszon "flyttar
//   sig" klockslaget (10:00 i Sverige visas som 11:00 i Finland).
// - true: klockslaget tolkas/visas ALLTID i familjens hemtidszon
//   (Europe/Stockholm) — 10:00 förblir 10:00 oavsett var enheten fysiskt
//   befinner sig. Kräver ingen ommigrering av befintlig data — gamla tider
//   sattes redan utifrån Sverige, de läses bara på ett sätt som inte längre
//   påverkas av var man tittar från.
//
// Delad mellan features/todos/recurringTodos.ts och
// features/children/routineHelpers.ts, som tidigare hade varsin identisk
// (icke tidszon-medveten) kopia av samma konvertering.

const HOME_TIME_ZONE = "Europe/Stockholm";

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60_000;
}

type WallClock = { h: number; m: number; s: number; ms: number };

function extractWallClock(date: Date, fixedTodoTimes: boolean): WallClock {
  if (!fixedTodoTimes) {
    return { h: date.getHours(), m: date.getMinutes(), s: date.getSeconds(), ms: date.getMilliseconds() };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: HOME_TIME_ZONE,
      hourCycle: "h23",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return { h: Number(parts.hour), m: Number(parts.minute), s: Number(parts.second), ms: date.getMilliseconds() };
}

function buildDateAtWallClock(
  year: number, month0: number, day: number,
  clock: WallClock, fixedTodoTimes: boolean
): Date {
  if (!fixedTodoTimes) {
    return new Date(year, month0, day, clock.h, clock.m, clock.s, clock.ms);
  }
  const naiveUTC = Date.UTC(year, month0, day, clock.h, clock.m, clock.s, clock.ms);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(naiveUTC), HOME_TIME_ZONE);
  return new Date(naiveUTC - offsetMinutes * 60_000);
}

export function timeToAnchorISO(hhmm: string, fixedTodoTimes = false): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return buildDateAtWallClock(2000, 0, 1, { h, m, s: 0, ms: 0 }, fixedTodoTimes).toISOString();
}

export function isoToTimeInput(iso: string | null, fixedTodoTimes = false): string {
  if (!iso) return "";
  const { h, m } = extractWallClock(new Date(iso), fixedTodoTimes);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Flyttar ett existerande ISO-klockslag till en ny kalenderdag (samma
// klockslag, nytt datum) — används av rutinernas dagliga occurrence-
// generering (recurringTodos.ts).
export function withWallClockOnDate(value: string | null, dateKey: string, fixedTodoTimes = false): string {
  if (!value) return `${dateKey}T00:00:00.000Z`;
  const clock = extractWallClock(new Date(value), fixedTodoTimes);
  const [year, month, day] = dateKey.split("-").map(Number);
  return buildDateAtWallClock(year, month - 1, day, clock, fixedTodoTimes).toISOString();
}
