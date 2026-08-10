// Delad "ms → klockslag"-formatering för alla stoppurs-/nedräkningsvisningar
// i appen (2026-08-10) — todo-timern (ADR-0018) och Medaljer/Rekord
// (TimedTask/TimedAttempt) är fortsatt medvetet SKILDA datamodeller (se
// Todo.elapsedMs-kommentaren i shared/types.ts), men själva formateringen av
// en millisekundsduration till text har ingen koppling till någotdera —
// tidigare duplicerad, ordagrant nästan identiskt, i sju separata filer.
// Konsoliderad hit på Zaidas förslag ("en hook vore kanske bra för timern?").
//
// Golvar alltid (Math.floor), aldrig avrundar — korrekt för en LIVE-tickande
// klocka (visar aldrig "2:00" innan 2 hela minuter faktiskt gått), och
// nödvändigt för att hundradels-varianten ska vara internt konsekvent (annars
// kunde heltalsdelen rundas upp medan hundradelarna fortfarande visar
// bråkdelen av föregående sekund).
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// Bara för VISUELL text (aldrig aria-label/aria-live — 20 uppdateringar per
// sekund skulle spamma skärmläsare, se respektive anropsställes egna
// sr-only-motsvarighet).
export function formatDurationWithHundredths(ms: number): string {
  const clamped = Math.max(0, ms);
  const hundredths = Math.floor((clamped % 1000) / 10);
  return `${formatDuration(clamped)}.${String(hundredths).padStart(2, "0")}`;
}
