import { useCallback, useEffect, useState } from "react";
import { timedTasksApi } from "../../api";
import { trackEvent } from "../../utils/analytics";
import type { Id, TimedTaskWithBest } from "@shared/types";

export function useTimedTasksState() {
  const [timedTasks, setTimedTasks] = useState<TimedTaskWithBest[]>([]);

  const refresh = useCallback(() => {
    return timedTasksApi.getAll().then(setTimedTasks).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createTimedTask(title: string, symbol: string | null, assignedTo: Id) {
    await timedTasksApi.create({ title, symbol, assignedTo });
    await refresh();
  }

  async function removeTimedTask(id: Id) {
    await timedTasksApi.remove(id);
    setTimedTasks((current) => current.filter((t) => t.id !== id));
  }

  // Barnet mäter tiden själv (Date.now() vid start/stopp i UI:t) — den här
  // funktionen skickar bara den färdiga varaktigheten och hämtar om listan så
  // nytt personbästa/antal försök syns direkt.
  async function recordAttempt(id: Id, durationMs: number) {
    const attempt = await timedTasksApi.recordAttempt(id, durationMs);
    trackEvent("timed-task-completed");
    await refresh();
    return attempt;
  }

  // Redigera-modalen (2026-07-13, penna-knappen) — hämtas bara on-demand när
  // modalen öppnas, ingen egen state (listan hålls i modalen själv).
  function listAttempts(id: Id) {
    return timedTasksApi.listAttempts(id);
  }

  // Kan ändra personbästa/antal försök (om det raderade försöket var
  // rekordet) — hämtar om huvudlistan så kortet uppdateras direkt.
  async function deleteAttempt(id: Id, attemptId: Id) {
    await timedTasksApi.deleteAttempt(id, attemptId);
    await refresh();
  }

  return { timedTasks, createTimedTask, removeTimedTask, recordAttempt, listAttempts, deleteAttempt };
}
