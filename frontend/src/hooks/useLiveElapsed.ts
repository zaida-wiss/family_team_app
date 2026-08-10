import { useFastTick } from "./useFastTick";

// Kombinerar useFastTick + "ackumulerad tid + tid sedan senaste start"-
// formeln (2026-08-10, Zaidas förslag: "en hook vore kanske bra för
// timern?") — samma uträkning fanns tidigare handskriven, näst intill
// identisk, i både ChildTimerTaskCard (ChildTasksSection.tsx) och
// TodoTimerSection (TodoDetailView.tsx). Passar EN timer per hook-anrop —
// ChildTimedTasksSection.tsx:s flera SAMTIDIGA tidtagningar (en Map, inte en
// enda startedAt) kan inte använda denna (Hooks-reglerna tillåter inte ett
// hook-anrop per item i en .map()), den delar istället en enda useFastTick
// direkt och räknar ut varje körande uppgifts egen tid inline.
//
// `active` styr BÅDE om den snabba klockan går (ingen onödig CPU/render när
// stoppuret är pausat/stängt) och om `now - startedAt` överhuvudtaget läggs
// till — är den falsk returneras bara `accumulatedMs` oförändrat (en
// pausad/aldrig startad timers redan korrekta, frusna värde).
export function useLiveElapsed(
  startedAt: number | null,
  accumulatedMs: number,
  active: boolean,
  intervalMs = 50
): number {
  const now = useFastTick(active, intervalMs);
  return active ? accumulatedMs + Math.max(0, now - (startedAt as number)) : accumulatedMs;
}
