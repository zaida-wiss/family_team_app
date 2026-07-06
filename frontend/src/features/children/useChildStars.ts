import { useMemo } from "react";
import type { Member, Todo } from "@shared/types";

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
  child: Pick<Member, "id" | "approvedStars" | "spentStars">,
  timelineTodos: Todo[],
  timerNow: number,
  localSpentStars: number
) {
  const childId = child.id;

  const approvedStarsToday = useMemo(() => {
    const today = new Date(timerNow);
    return timelineTodos
      .filter(
        (t) =>
          t.assignedTo === childId &&
          t.status === "approved" &&
          t.deletedAt === null &&
          isSameLocalDay(t.completedAt, today)
      )
      .reduce((sum, t) => sum + t.starValue, 0);
  }, [timelineTodos, childId, timerNow]);

  // Summera godkända todos i listan (nu bara 7 dagar) som fallback för konton
  // som skapades innan approvedStars-fältet lades till (dessa har approvedStars=0).
  const starsFromRecentTodos = useMemo(
    () =>
      timelineTodos
        .filter((t) => t.assignedTo === childId && t.status === "approved" && t.deletedAt === null)
        .reduce((sum, t) => sum + t.starValue, 0),
    [timelineTodos, childId]
  );

  // Använd server-fältet om det är populerat, annars todo-summan.
  // Math.max säkerställer att vi aldrig visar färre stjärnor än vad som syns i listan.
  const totalApprovedStars = Math.max(child.approvedStars ?? 0, starsFromRecentTodos);

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
