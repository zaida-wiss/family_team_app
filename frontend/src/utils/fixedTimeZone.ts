// Tidszon-hjälpare för fasta klockslag (2026-07-16, Zaidas önskemål efter att
// familjen reste till Finland: "inte att de byter tid, utan är samma tider...
// eller om man vill välja att de ska vara en timme senare (som det blir nu på
// default)"). Ursprungligen bara för todo/rutin-klockslag (Account.
// fixedTodoTimes), utökad 2026-07-30 till att även gälla kalenderhändelser
// (Account.fixedCalendarTimes, en HELT EGEN, oberoende inställning — "för
// dessa kan du vilja ha olika inställningar för", Zaidas ord) — filen döpt om
// från todoTimeZone.ts eftersom den inte längre är todo-specifik. Två lägen,
// styrda av respektive kontoinställning:
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
// Delad mellan features/todos/recurringTodos.ts, features/children/
// routineHelpers.ts och features/calendars/ (useCalendarView.ts,
// calendarHelpers.ts:s fmtTime).
//
// Känd begränsning (kalendersidan, 2026-07-30): en återkommande händelses
// FRAMTIDA förekomster (calendarHelpers.ts:s addInterval/expandForRange/
// expandForMonth) räknas fortfarande fram med enhetens egen lokala
// datumaritmetik, inte hemtidszonens — ett klockslag kan därför visa fel
// timme för en framtida upprepning om enheten just då befinner sig i en
// annan tidszon OCH en sommartidsväxling inträffar mellan idag och den
// förekomsten. Påverkar inte en enskild (icke-återkommande) händelse, som
// alltid räknas om korrekt via funktionerna nedan. Samma sak gäller vilken
// KALENDERDAG en händelse visas under i vecko-/månadsvyn (fortsatt enhetens
// lokala datum) — kan i sällsynta fall (händelse nära midnatt + stor
// tidsskillnad) visas under fel dag. Inte åtgärdat denna omgång.

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
type WallDateTime = WallClock & { y: number; mo: number; d: number };

function extractWallClock(date: Date, fixed: boolean): WallClock {
  if (!fixed) {
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

// Som extractWallClock, men inkluderar även kalenderdatumet (år/månad/dag) i
// samma tidszon — behövs av kalenderhändelser (som har ett riktigt datum,
// inte bara ett klockslag på en fast ankardag som todos).
function extractWallDateTime(date: Date, fixed: boolean): WallDateTime {
  if (!fixed) {
    return {
      y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(),
      h: date.getHours(), m: date.getMinutes(), s: date.getSeconds(), ms: date.getMilliseconds()
    };
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: HOME_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year), mo: Number(parts.month), d: Number(parts.day),
    h: Number(parts.hour), m: Number(parts.minute), s: Number(parts.second), ms: date.getMilliseconds()
  };
}

function buildDateAtWallClock(
  year: number, month0: number, day: number,
  clock: WallClock, fixed: boolean
): Date {
  if (!fixed) {
    return new Date(year, month0, day, clock.h, clock.m, clock.s, clock.ms);
  }
  const naiveUTC = Date.UTC(year, month0, day, clock.h, clock.m, clock.s, clock.ms);
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(naiveUTC), HOME_TIME_ZONE);
  return new Date(naiveUTC - offsetMinutes * 60_000);
}

export function timeToAnchorISO(hhmm: string, fixed = false): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return buildDateAtWallClock(2000, 0, 1, { h, m, s: 0, ms: 0 }, fixed).toISOString();
}

export function isoToTimeInput(iso: string | null, fixed = false): string {
  if (!iso) return "";
  const { h, m } = extractWallClock(new Date(iso), fixed);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Flyttar ett existerande ISO-klockslag till en ny kalenderdag (samma
// klockslag, nytt datum) — används av rutinernas dagliga occurrence-
// generering (recurringTodos.ts).
export function withWallClockOnDate(value: string | null, dateKey: string, fixed = false): string {
  if (!value) return `${dateKey}T00:00:00.000Z`;
  const clock = extractWallClock(new Date(value), fixed);
  const [year, month, day] = dateKey.split("-").map(Number);
  return buildDateAtWallClock(year, month - 1, day, clock, fixed).toISOString();
}

// Kalenderhändelser (2026-07-30, Account.fixedCalendarTimes): en `<input
// type="datetime-local">`-sträng ("YYYY-MM-DDTHH:MM") ⇄ ISO, med ett riktigt
// datum (inte bara ett klockslag på en fast ankardag som todos ovan).
export function isoToLocalDateTimeStr(iso: string, fixed = false): string {
  const wdt = extractWallDateTime(new Date(iso), fixed);
  return `${wdt.y}-${String(wdt.mo).padStart(2, "0")}-${String(wdt.d).padStart(2, "0")}T${String(wdt.h).padStart(2, "0")}:${String(wdt.m).padStart(2, "0")}`;
}

export function localDateTimeToISO(value: string, fixed = false): string {
  const [datePart, timePart] = value.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, m] = (timePart ?? "00:00").split(":").map(Number);
  return buildDateAtWallClock(y, mo - 1, d, { h, m, s: 0, ms: 0 }, fixed).toISOString();
}
