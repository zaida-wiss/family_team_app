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

function readStartedAt(todoId: string, maxMinutes: number): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + todoId);
    if (!raw) return null;
    const startedAt = Number(raw);
    if (!Number.isFinite(startedAt)) return null;
    // Auto-stopp: en timer som legat igång längre än taket räknas inte
    // längre som pågående — rensas tyst istället för att fortsätta räkna
    // upp en orimlig tid (särskilt viktigt nu när resultatet kan sparas
    // till Medaljer/Rekords personbästa-statistik, se completeTodo).
    if (Date.now() - startedAt > maxMinutes * 60_000) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + todoId);
      } catch {
        // ignorerat
      }
      return null;
    }
    return startedAt;
  } catch {
    return null;
  }
}

// Icke-reaktiva varianter för användning utanför en komponent (t.ex.
// ParentTodoThreadView.tsx:s handleConfirmComplete/tre-tryck-hanterare, som
// startar/läser av en timer utanför React-render).
export function readTodoTimerStartedAt(
  todoId: string,
  maxMinutes: number = DEFAULT_TIMER_MAX_MINUTES
): number | null {
  return readStartedAt(todoId, maxMinutes);
}

export function startTodoTimer(todoId: string): number {
  const now = Date.now();
  try {
    localStorage.setItem(STORAGE_PREFIX + todoId, String(now));
  } catch {
    // ignorerat
  }
  return now;
}

export function clearTodoTimer(todoId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + todoId);
  } catch {
    // ignorerat — samma "bästa-försök"-hållning som resten av localCache.ts
  }
}

export function useTodoTimer(todoId: string, maxMinutes: number = DEFAULT_TIMER_MAX_MINUTES) {
  const [startedAt, setStartedAt] = useState<number | null>(() => readStartedAt(todoId, maxMinutes));

  useEffect(() => {
    setStartedAt(readStartedAt(todoId, maxMinutes));
  }, [todoId, maxMinutes]);

  function start() {
    setStartedAt(startTodoTimer(todoId));
  }

  function clear() {
    clearTodoTimer(todoId);
    setStartedAt(null);
  }

  return { startedAt, start, clear };
}
