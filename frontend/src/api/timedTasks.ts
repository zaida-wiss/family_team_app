import type { Id, TimedTaskWithBest } from "@shared/types";
import { api, request } from "./client";

type CreateTimedTaskInput = {
  title: string;
  symbol?: string | null;
  assignedTo: Id;
};

type RecordedAttempt = {
  id: Id;
  durationMs: number;
  achievedAt: string;
  isNewRecord: boolean;
};

// Redigera-modalen (2026-07-13) — datum/antal per dag + linjediagram byggs
// klientsidan av den här listan, ingen egen aggregerings-endpoint.
export type TimedAttemptListItem = {
  id: Id;
  timedTaskId: Id;
  memberId: Id;
  durationMs: number;
  achievedAt: string;
  isNewRecord: boolean;
};

export const timedTasksApi = {
  getAll: () => request<TimedTaskWithBest[]>(api("timed-tasks")),
  create: (input: CreateTimedTaskInput) =>
    request<{ id: Id }>(api("timed-tasks"), { method: "POST", body: JSON.stringify(input) }),
  remove: (id: Id) =>
    request<{ ok: boolean }>(api(`timed-tasks/${id}`), { method: "DELETE" }),
  // achievedAt (2026-07-13, offline-kö-stödet i useTimedTasksState.ts) —
  // klientens egen tidsstämpel för när tidtagningen faktiskt stoppades,
  // inte servertid, så ett offline-köat och senare synkat försök behåller
  // sin RIKTIGA tid istället för synk-ögonblickets.
  recordAttempt: (id: Id, durationMs: number, achievedAt: string) =>
    request<RecordedAttempt>(api(`timed-tasks/${id}/attempts`), {
      method: "POST",
      body: JSON.stringify({ durationMs, achievedAt })
    }),
  listAttempts: (id: Id) => request<TimedAttemptListItem[]>(api(`timed-tasks/${id}/attempts`)),
  deleteAttempt: (id: Id, attemptId: Id) =>
    request<{ ok: boolean }>(api(`timed-tasks/${id}/attempts/${attemptId}`), { method: "DELETE" })
};
