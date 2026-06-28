import { useMemo } from "react";
import type { Id, Todo } from "@shared/types";

function isSameLocalDay(isoStr: string | null, date: Date): boolean {
  if (!isoStr) return false;
  const c = new Date(isoStr);
  return (
    c.getFullYear() === date.getFullYear() &&
    c.getMonth() === date.getMonth() &&
    c.getDate() === date.getDate()
  );
}

export function useChildStars(
  childId: Id,
  timelineTodos: Todo[],
  timerNow: number,
  localSpentStars: number
) {
  const today = new Date(timerNow);

  const approvedStarsToday = useMemo(
    () =>
      timelineTodos
        .filter(
          (t) =>
            t.assignedTo === childId &&
            t.status === "approved" &&
            t.deletedAt === null &&
            isSameLocalDay(t.approvedAt ?? t.completedAt, today)
        )
        .reduce((sum, t) => sum + t.starValue, 0),
    // timerNow drives today — include it so the filter re-runs at midnight
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timelineTodos, childId, timerNow]
  );

  const totalApprovedStars = useMemo(
    () =>
      timelineTodos
        .filter(
          (t) => t.assignedTo === childId && t.status === "approved" && t.deletedAt === null
        )
        .reduce((sum, t) => sum + t.starValue, 0),
    [timelineTodos, childId]
  );

  const pendingApprovalTodos = useMemo(
    () =>
      [...timelineTodos]
        .filter((t) => t.assignedTo === childId && t.status === "done" && t.deletedAt === null)
        .sort((a, b) => {
          const tA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const tB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return tB - tA;
        })
        .slice(0, 8),
    [timelineTodos, childId]
  );

  return {
    approvedStarsToday,
    totalApprovedStars,
    availableStars: totalApprovedStars - localSpentStars,
    pendingApprovalTodos,
  };
}
