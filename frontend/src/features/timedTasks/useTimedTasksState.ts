import { useCallback, useEffect, useState } from "react";
import { timedTasksApi } from "../../api";
import { trackEvent } from "../../utils/analytics";
import { readCache, writeCache } from "../../utils/localCache";
import type { Id, TimedTaskWithBest } from "@shared/types";

const PENDING_ATTEMPTS_KEY = "timedTaskPendingAttempts";
const TIMED_TASKS_CACHE_KEY = "timed_tasks_v1";
// Samma meddelande som client.ts:s nätverksfel (performRequest) — det enda
// sättet att skilja "ingen uppkoppling" (ska köas) från ett riktigt
// serverfel (t.ex. uppgiften raderad — ska INTE köas om i all evighet).
const NETWORK_ERROR_MESSAGE = "Servern är inte nåbar";

type PendingAttempt = { localId: string; timedTaskId: Id; durationMs: number; achievedAt: string };

function loadPendingAttempts(): PendingAttempt[] {
  try {
    const raw = window.localStorage.getItem(PENDING_ATTEMPTS_KEY);
    return raw ? (JSON.parse(raw) as PendingAttempt[]) : [];
  } catch {
    return [];
  }
}

function savePendingAttempts(pending: PendingAttempt[]) {
  window.localStorage.setItem(PENDING_ATTEMPTS_KEY, JSON.stringify(pending));
}

function isNetworkError(err: unknown): boolean {
  return err instanceof Error && err.message === NETWORK_ERROR_MESSAGE;
}

export function useTimedTasksState() {
  // Stale-while-revalidate (2026-07-17) — se useTodosState.ts för samma
  // mönster. Bara listan (personbästa/antal försök) cachas, inte den
  // detaljerade försökshistoriken (listAttempts, hämtas on-demand i
  // redigera-modalen) — kvarstående, känd begränsning.
  const [timedTasks, setTimedTasks] = useState<TimedTaskWithBest[]>(() => readCache(TIMED_TASKS_CACHE_KEY, []));

  const refresh = useCallback(() => {
    return timedTasksApi.getAll().then((fresh) => {
      setTimedTasks(fresh);
      writeCache(TIMED_TASKS_CACHE_KEY, fresh);
    }).catch(console.error);
  }, []);

  // Offline-kö (2026-07-13, Zaidas önskemål: "tiderna skall sparas i
  // databasen, men om internetuppkoppling saknas så skall det sparas i
  // local storage, som då rensas när data förs över i databasen") —
  // försöker synka kvarglömda försök från en tidigare offline-period vid
  // appstart, och igen så fort webbläsaren fått tillbaka en uppkoppling
  // (window "online"-eventet). Kronologisk ordning (äldst achievedAt
  // först) så personbästa-jämförelsen på servern (recordAttempt läser
  // "bästa hittills" vid varje anrop) blir korrekt stegvis, precis som om
  // försöken hade skickats i realtid istället för i en klump i efterhand.
  const flushPendingAttempts = useCallback(async () => {
    const pending = loadPendingAttempts();
    if (pending.length === 0) return;
    const sorted = [...pending].sort(
      (a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime()
    );
    const stillPending: PendingAttempt[] = [];
    let anySynced = false;
    for (const item of sorted) {
      try {
        await timedTasksApi.recordAttempt(item.timedTaskId, item.durationMs, item.achievedAt);
        anySynced = true;
      } catch (err) {
        if (isNetworkError(err)) {
          stillPending.push(item);
        }
        // Ett icke-nätverksfel (t.ex. uppgiften raderad under tiden) —
        // släpper försöket istället för att köa om det i all evighet.
      }
    }
    savePendingAttempts(stillPending);
    if (anySynced) await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    void flushPendingAttempts();
    window.addEventListener("online", flushPendingAttempts);
    return () => window.removeEventListener("online", flushPendingAttempts);
  }, [refresh, flushPendingAttempts]);

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
  // nytt personbästa/antal försök syns direkt. Misslyckas anropet av
  // NÄTVERKSSKÄL (ingen uppkoppling) köas försöket i localStorage istället
  // för att gå förlorat — synkas automatiskt (och rensas ur localStorage)
  // så fort uppkopplingen är tillbaka, se flushPendingAttempts ovan. Ett
  // köat försök kan inte veta om det blir ett nytt rekord (bara servern vet
  // "bästa hittills"), så isNewRecord blir false — ingen flash-animation,
  // men själva tiden går aldrig förlorad.
  async function recordAttempt(id: Id, durationMs: number, achievedAt: string) {
    try {
      const attempt = await timedTasksApi.recordAttempt(id, durationMs, achievedAt);
      trackEvent("timed-task-completed");
      await refresh();
      return attempt;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const pending = loadPendingAttempts();
      pending.push({ localId: `pending-${crypto.randomUUID()}`, timedTaskId: id, durationMs, achievedAt });
      savePendingAttempts(pending);
      return { id: `pending-${crypto.randomUUID()}`, durationMs, achievedAt, isNewRecord: false };
    }
  }

  // Redigera-modalen (2026-07-13, medalj-knappen) — hämtas bara on-demand när
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
