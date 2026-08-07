import { useState } from "react";
import { useNowTick } from "../../hooks/useNowTick";
import { ChildDashboard } from "./ChildDashboard";
import { ChildRecordsPage } from "./ChildRecordsPage";
import type { Calendar, Id, Member, Role, Todo, TodoCategory, TimedTaskWithBest } from "@shared/types";
import type { TimedAttemptListItem } from "../../api/timedTasks";
import { isTodoVisibleNow } from "../todos/selectors";

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
  // Tickande klocka (2026-08-06, se useNowTick.ts) — var tidigare
  // Date.now() beräknat en gång per rendering, så en uppgift med ett
  // tidsfönster (t.ex. en morgonrutin) bara försvann vid nästa omrendering
  // av en annan anledning, inte exakt när fönstret gick ut.
  const now = useNowTick();
  // Gömda kategoriers uppgifter ska inte synas här (2026-07-22, Zaidas
  // önskemål: "mallar till listor och undanlagda listor skall inte stå med
  // i barnvyn ens för vuxna, endast assignade 2do") — samma fix som
  // MemberShellContent.tsx:s motsvarande beräkning för en vuxen som tittar
  // på ett barns dashboard.
  // 2026-07-24, Zaidas önskemål: skriver barnet upp sig ("håller på med",
  // inProgressBy) på en otilldelad Familjen-uppgift ska den även dyka upp
  // i barnets egen dashboard-lista, samma fix som MemberShellContent.tsx.
  // "expired" behandlas som "pending" (2026-08-08, Zaidas önskemål: "alla
  // todos som inte markerats som slutförda skall visas om tiden är efter
  // starttid, och före sluttid, oavsett när jag redigerar") — samma fix som
  // MemberShellContent.tsx:s motsvarande activeChildTodos-beräkning.
  const activeChildTodos = todos
    .filter(
      (t) =>
        (t.assignedTo === currentMember.id ||
          (t.assignedTo === null && t.inProgressBy?.includes(currentMember.id))) &&
        (t.status === "pending" || t.status === "expired") &&
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
