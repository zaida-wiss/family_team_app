import { useEffect, useState } from "react";
import type { Todo } from "@shared/types";

// Todo-timerns "pågår"-status (2026-08-07/08, Zaidas önskemål: timern ska gå
// att välja för ALLA uppgifter, startas med tre snabba tryck i BÅDA
// barnvyn och vuxenvyn, och flera ska kunna gå SAMTIDIGT — se ADR-0018) —
// rent klientsidigt, ingen server-side pågående-status finns. localStorage-
// backad (samma "klienten mäter, absolut tidsstämpel"-princip som
// useRecipeCookingSession.ts/RecipeStepTimer.tsx) så en pågående timer
// överlever att en modal/kort stängs och öppnas igen, eller att man byter
// panel/sida helt — och eftersom varje todo har sin EGEN lagringsnyckel kan
// flera timers gå parallellt utan att krocka eller avbryta varandra.
//
// 2026-08-09, uppföljning (Zaidas önskemål: "ett snabbt tryck stoppar
// tiden... ett långt tryck stoppar både tiden och markerar uppgiften som
// slutförd") — timern kan nu PAUSAS (frysa den förflutna tiden utan att
// nollställa den, till skillnad från tre-tryck-omstarten som alltid börjar
// om från 0) och återupptas med ytterligare ett tryck. Lagringsformatet
// utökat från en enda tidsstämpel till {startedAt, accumulatedMs}:
// startedAt är NÄR DEN NUVARANDE KÖRANDE PERIODEN började (null om
// pausad), accumulatedMs är summan av alla TIDIGARE, redan avslutade
// körperioder. Total förfluten tid = accumulatedMs + (startedAt !== null
// ? now-startedAt : 0).
const STORAGE_PREFIX = "todo-timer:";

// Auto-stopp (2026-08-08, Zaidas önskemål: "alla timer från 2do skall
// stanna automatiskt efter 2h, men det skall gå att ställa in detta i
// todo") — default när Todo.timerMaxMinutes saknas/är null. Gäller bara
// ÖPPNA tidtagningar (ingen plannedDurationMinutes) — en nedräkning har
// redan sin egen, kortare, inbyggda gräns (max 480 min).
export const DEFAULT_TIMER_MAX_MINUTES = 120;

// En NEDRÄKNING (plannedDurationMinutes satt) har redan sin egen, kortare,
// inbyggda gräns (max 480 min, se TodoSchema) — auto-stoppet är bara ett
// säkerhetsnät mot en helt bortglömd/aldrig avslutad timer, inte något som
// ska kunna klippa av en legitim avklarmarkering PRECIS när nedräkningen når
// noll (en 30 minuters marginal ovanpå den planerade tiden undviker den
// racen). Bara en ÖPPEN tidtagning (stoppur, ingen plannedDurationMinutes)
// använder det faktiska, konfigurerbara timerMaxMinutes-fältet.
export function timerCapMinutes(todo: Pick<Todo, "plannedDurationMinutes" | "timerMaxMinutes">): number {
  if (todo.plannedDurationMinutes) return todo.plannedDurationMinutes + 30;
  return todo.timerMaxMinutes ?? DEFAULT_TIMER_MAX_MINUTES;
}

type TimerState = { startedAt: number | null; accumulatedMs: number };

const INACTIVE: TimerState = { startedAt: null, accumulatedMs: 0 };

function readState(todoId: string, maxMinutes: number): TimerState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + todoId);
    if (!raw) return INACTIVE;
    let state: TimerState;
    try {
      const parsed = JSON.parse(raw) as Partial<TimerState>;
      state = {
        startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
        accumulatedMs: typeof parsed.accumulatedMs === "number" ? parsed.accumulatedMs : 0
      };
    } catch {
      // Gammalt lagringsformat (en ren tidsstämpel, från innan paus-stödet)
      // — tolkas som en fortsatt körande period utan tidigare ackumulerad
      // tid, så en timer som redan gick vid en omdeploy inte tappas bort.
      const legacy = Number(raw);
      if (!Number.isFinite(legacy)) return INACTIVE;
      state = { startedAt: legacy, accumulatedMs: 0 };
    }
    const totalMs = state.accumulatedMs + (state.startedAt !== null ? Date.now() - state.startedAt : 0);
    // Auto-stopp mot TOTAL förfluten tid, inte bara den nuvarande körande
    // periodens längd — annars kunde en paus-och-återuppta-cykel kringgå
    // taket genom att pausa strax före gränsen.
    if (totalMs > maxMinutes * 60_000) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + todoId);
      } catch {
        // ignorerat
      }
      return INACTIVE;
    }
    return state;
  } catch {
    return INACTIVE;
  }
}

function writeState(todoId: string, state: TimerState): void {
  try {
    if (state.startedAt === null && state.accumulatedMs === 0) {
      localStorage.removeItem(STORAGE_PREFIX + todoId);
    } else {
      localStorage.setItem(STORAGE_PREFIX + todoId, JSON.stringify(state));
    }
  } catch {
    // ignorerat — samma "bästa-försök"-hållning som resten av localCache.ts
  }
}

// Icke-reaktiv variant för användning utanför en komponent (t.ex.
// ParentTodoThreadView.tsx:s handleConfirmComplete/tre-tryck-hanterare, som
// startar/läser av en timer utanför React-render). Returnerar den TOTALA
// förflutna tiden (ackumulerad + eventuell nu körande period), inte bara
// "now - startedAt" som tidigare — annars hade en paus/återuppta-cykel
// tappat den tid som gått innan pausen.
export function readTodoTimerElapsedMs(
  todoId: string,
  maxMinutes: number = DEFAULT_TIMER_MAX_MINUTES
): number | null {
  const state = readState(todoId, maxMinutes);
  if (state.startedAt === null && state.accumulatedMs === 0) return null;
  return state.accumulatedMs + (state.startedAt !== null ? Math.max(0, Date.now() - state.startedAt) : 0);
}

// Är timern aktiv (körande ELLER pausad med förfluten tid) — avgör om ett
// enda tryck ska tolkas som paus/återuppta eller ignoreras (ingenting att
// pausa på en aldrig startad timer).
export function readTodoTimerIsActive(todoId: string, maxMinutes: number = DEFAULT_TIMER_MAX_MINUTES): boolean {
  const state = readState(todoId, maxMinutes);
  return state.startedAt !== null || state.accumulatedMs > 0;
}

export function startTodoTimer(todoId: string): void {
  writeState(todoId, { startedAt: Date.now(), accumulatedMs: 0 });
}

export function clearTodoTimer(todoId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + todoId);
  } catch {
    // ignorerat
  }
}

// Pausar en körande timer (fryser den förflutna tiden) eller återupptar en
// pausad — ingen effekt om timern aldrig startats (2026-08-09, Zaidas
// önskemål: "ett snabbt tryck stoppar tiden").
export function toggleTodoTimerPause(todoId: string, maxMinutes: number = DEFAULT_TIMER_MAX_MINUTES): void {
  const state = readState(todoId, maxMinutes);
  if (state.startedAt !== null) {
    writeState(todoId, { startedAt: null, accumulatedMs: state.accumulatedMs + (Date.now() - state.startedAt) });
  } else if (state.accumulatedMs > 0) {
    writeState(todoId, { startedAt: Date.now(), accumulatedMs: state.accumulatedMs });
  }
  // annars: aldrig startad, ingenting att pausa/återuppta.
}

export function useTodoTimer(todoId: string, maxMinutes: number = DEFAULT_TIMER_MAX_MINUTES) {
  const [state, setState] = useState<TimerState>(() => readState(todoId, maxMinutes));

  useEffect(() => {
    setState(readState(todoId, maxMinutes));
  }, [todoId, maxMinutes]);

  function start() {
    startTodoTimer(todoId);
    setState({ startedAt: Date.now(), accumulatedMs: 0 });
  }

  function clear() {
    clearTodoTimer(todoId);
    setState(INACTIVE);
  }

  function togglePause() {
    toggleTodoTimerPause(todoId, maxMinutes);
    setState(readState(todoId, maxMinutes));
  }

  return {
    // null = inte körande just nu (antingen pausad eller aldrig startad) —
    // samma betydelse som tidigare, oförändrat kontrakt för konsumenter som
    // bara bryr sig om "körs den".
    startedAt: state.startedAt,
    accumulatedMs: state.accumulatedMs,
    isPaused: state.startedAt === null && state.accumulatedMs > 0,
    isActive: state.startedAt !== null || state.accumulatedMs > 0,
    start,
    clear,
    togglePause
  };
}
