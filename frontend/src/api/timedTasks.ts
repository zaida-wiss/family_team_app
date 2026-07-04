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

export const timedTasksApi = {
  getAll: () => request<TimedTaskWithBest[]>(api("timed-tasks")),
  create: (input: CreateTimedTaskInput) =>
    request<{ id: Id }>(api("timed-tasks"), { method: "POST", body: JSON.stringify(input) }),
  remove: (id: Id) =>
    request<{ ok: boolean }>(api(`timed-tasks/${id}`), { method: "DELETE" }),
  recordAttempt: (id: Id, durationMs: number) =>
    request<RecordedAttempt>(api(`timed-tasks/${id}/attempts`), {
      method: "POST",
      body: JSON.stringify({ durationMs })
    })
};
