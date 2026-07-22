import { useState } from "react";
import { ChildDashboard } from "./ChildDashboard";
import { ChildRecordsPage } from "./ChildRecordsPage";
import type { Calendar, Id, Member, Role, Todo, TodoCategory, TimedTaskWithBest } from "@shared/types";
import type { TimedAttemptListItem } from "../../api/timedTasks";

type Props = {
  currentMember: Member;
  calendars: Calendar[];
  todos: Todo[];
  roles: Role[];
  categories: TodoCategory[];
  timedTasks: TimedTaskWithBest[];
  onRecordTimedAttempt: (id: Id, durationMs: number, achievedAt: string) => Promise<{ isNewRecord: boolean }>;
  onListTimedAttempts: (id: Id) => Promise<TimedAttemptListItem[]>;
  onDeleteTimedAttempt: (id: Id, attemptId: Id) => Promise<void>;
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
  categories,
  timedTasks,
  onRecordTimedAttempt,
  onListTimedAttempts,
  onDeleteTimedAttempt,
  onCreateWish,
  onCompleteTodo,
  onDismissRejectedTodo,
  onThemePickerOpen,
}: Props) {
  const childTimedTasks = timedTasks.filter((t) => t.assignedTo === currentMember.id);
  const now = Date.now();
  // Gömda kategoriers uppgifter ska inte synas här (2026-07-22, Zaidas
  // önskemål: "mallar till listor och undanlagda listor skall inte stå med
  // i barnvyn ens för vuxna, endast assignade 2do") — samma fix som
  // MemberShellContent.tsx:s motsvarande beräkning för en vuxen som tittar
  // på ett barns dashboard.
  const activeChildTodos = todos
    .filter(
      (t) =>
        t.assignedTo === currentMember.id &&
        t.status === "pending" &&
        t.recurrence.type === "none" &&
        t.deletedAt === null &&
        isTodoVisibleNow(t, now) &&
        !(t.personalCategoryId && categories.find((c) => c.id === t.personalCategoryId)?.hidden)
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
        onListAttempts={onListTimedAttempts}
        onDeleteAttempt={onDeleteTimedAttempt}
        onBack={() => setView("dashboard")}
      />
    );
  }

  return (
    <ChildDashboard
      child={currentMember}
      calendars={calendars}
      roles={roles}
      categories={categories}
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
