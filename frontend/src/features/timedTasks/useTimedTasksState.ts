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

  return { timedTasks, createTimedTask, removeTimedTask, recordAttempt };
}
