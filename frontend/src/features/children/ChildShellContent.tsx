import { useState } from "react";
import { ChildDashboard } from "./ChildDashboard";
import { ChildRecordsPage } from "./ChildRecordsPage";
import type { Calendar, Id, Member, Role, Todo, TimedTaskWithBest } from "@shared/types";

type Props = {
  currentMember: Member;
  calendars: Calendar[];
  todos: Todo[];
  roles: Role[];
  timedTasks: TimedTaskWithBest[];
  onRecordTimedAttempt: (id: Id, durationMs: number) => Promise<{ isNewRecord: boolean }>;
  onCreateWish: (childId: string, starsNeeded: number, title?: string) => void;
  onCompleteTodo: (member: Member, todoId: string, roles: Role[], elapsedMs?: number | null) => void;
  onDismissRejectedTodo: (todoId: string, memberId: string) => void;
  onThemePickerOpen: (memberId: string) => void;
};

function isTodoVisibleNow(
  todo: { visibleFrom: string | null; expiresAt: string | null },
  now: number
) {
  const from = todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
  const until = todo.expiresAt ? new Date(todo.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return from <= now && now < until;
}

export function ChildShellContent({
  currentMember,
  calendars,
  todos,
  roles,
  timedTasks,
  onRecordTimedAttempt,
  onCreateWish,
  onCompleteTodo,
  onDismissRejectedTodo,
  onThemePickerOpen,
}: Props) {
  const childTimedTasks = timedTasks.filter((t) => t.assignedTo === currentMember.id);
  const now = Date.now();
  const activeChildTodos = todos
    .filter(
      (t) =>
        t.assignedTo === currentMember.id &&
        t.status === "pending" &&
        t.recurrence.type === "none" &&
        t.deletedAt === null &&
        isTodoVisibleNow(t, now)
    )
    .sort((a, b) => {
      const aTime = a.visibleFrom ? new Date(a.visibleFrom).getTime() : 0;
      const bTime = b.visibleFrom ? new Date(b.visibleFrom).getTime() : 0;
      return aTime - bTime;
    });
  const rejectedTodos = todos.filter(
    (t) =>
      t.assignedTo === currentMember.id &&
      t.status === "rejected" &&
      t.deletedAt === null
  );

  // Egen sida för Medaljer/Rekord (2026-07-06, Zaidas beslut) — nås via en
  // pokal-knapp i ChildHero istället för att alltid ligga synlig i dashboarden.
  const [view, setView] = useState<"dashboard" | "records">("dashboard");

  if (view === "records") {
    return (
      <ChildRecordsPage
        themeName={currentMember.dashboardTheme ?? "space"}
        timedTasks={childTimedTasks}
        onRecordAttempt={onRecordTimedAttempt}
        onBack={() => setView("dashboard")}
      />
    );
  }

  return (
    <ChildDashboard
      child={currentMember}
      calendars={calendars}
      roles={roles}
      timelineTodos={todos}
      activeChildTodos={activeChildTodos}
      rejectedTodos={rejectedTodos}
      onOpenRecords={() => setView("records")}
      onCreateWish={onCreateWish}
      onCompleteTodo={(todoId, elapsedMs) => onCompleteTodo(currentMember, todoId, roles, elapsedMs)}
      onDismissRejectedTodo={(todoId) => onDismissRejectedTodo(todoId, currentMember.id)}
      onThemePickerOpen={onThemePickerOpen}
    />
  );
}
