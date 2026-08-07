import { useEffect, useState } from "react";

// Todo-timerns "pågår"-status (2026-08-07, Zaidas önskemål: timern ska gå att
// välja för ALLA uppgifter, inte bara barn-tilldelade — se ADR-0018) — rent
// klientsidigt, ingen server-side pågående-status finns (samma princip som
// ChildTasksSection.tsx:s runningTimer redan följer). Till skillnad från
// barnets kort (som normalt förblir monterat under hela sessionen) öppnas och
// stängs TodoDetailView-modalen om och om igen — localStorage-backad (samma
// "klienten mäter, absolut tidsstämpel"-princip som useRecipeCookingSession.ts
// /RecipeStepTimer.tsx) så en pågående timer överlever att modalen stängs och
// öppnas igen eller att man byter panel.
const STORAGE_PREFIX = "todo-timer:";

function readStartedAt(todoId: string): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + todoId);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Icke-reaktiv variant för användning utanför en komponent (t.ex.
// ParentTodoThreadView.tsx:s handleConfirmComplete, som läser av en eventuell
// pågående timer när bubblan hålls intryckt för att räkna ut elapsedMs).
export function readTodoTimerStartedAt(todoId: string): number | null {
  return readStartedAt(todoId);
}

export function clearTodoTimer(todoId: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + todoId);
  } catch {
    // ignorerat — samma "bästa-försök"-hållning som resten av localCache.ts
  }
}

export function useTodoTimer(todoId: string) {
  const [startedAt, setStartedAt] = useState<number | null>(() => readStartedAt(todoId));

  useEffect(() => {
    setStartedAt(readStartedAt(todoId));
  }, [todoId]);

  function start() {
    const now = Date.now();
    try {
      localStorage.setItem(STORAGE_PREFIX + todoId, String(now));
    } catch {
      // ignorerat
    }
    setStartedAt(now);
  }

  function clear() {
    clearTodoTimer(todoId);
    setStartedAt(null);
  }

  return { startedAt, start, clear };
}
