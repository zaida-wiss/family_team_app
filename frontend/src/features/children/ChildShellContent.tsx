import { useEffect, useRef, useState } from "react";
import { useNowTick } from "../../hooks/useNowTick";
import { ChildDashboard } from "./ChildDashboard";
import { ChildRecordsPage } from "./ChildRecordsPage";
import type { Calendar, Id, Member, Role, Todo, TodoCategory, TimedTaskWithBest } from "@shared/types";
import type { TimedAttemptListItem } from "../../api/timedTasks";
import { getActiveChildTodos, getAssignedSubtaskCards, getRejectedTodosForMember } from "../todos/selectors";

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
  onUncompleteTodo: (member: Member, todoId: string, roles: Role[]) => void;
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
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
  onUncompleteTodo,
  onToggleSubtask,
  onDismissRejectedTodo,
  onThemePickerOpen,
}: Props) {
  // Håll-in-gesterna (klarmarkera/ångra) fryser sin onConfirm-callback vid
  // PRESS-tid (useHoldToConfirm.ts:s setTimeout), inte vid de 2s senare när
  // hållet faktiskt löser ut. roles hämtas numera via deferToIdle (S1a,
  // 2026-07-26) och är därför ofta [] precis vid mount, innan requestIdleCallback
  // hunnit köra — trycker barnet direkt (eller dispatchar ett testevent direkt)
  // fångas den STALE tomma roles-arrayen i stängningen, canCompleteTodo nekas
  // tyst och API-anropet görs aldrig, oavsett hur länge man väntar efteråt.
  // rolesRef löser det utan att röra useHoldToConfirm/dess övriga konsumenter —
  // closures som läser rolesRef.current (istället för roles direkt) ser alltid
  // den SENASTE listan vid EXEKVERINGSTID, oavsett när själva closuren skapades.
  const rolesRef = useRef(roles);
  useEffect(() => {
    rolesRef.current = roles;
  }, [roles]);

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
  // Ett riktigt barns egen dashboard är alltid exakt klockslags-gated (ingen
  // rangeAware — se getActiveChildTodos i selectors.ts för den fulla
  // bakgrunden, delad med MemberShellContent.tsx:s motsvarande beräkning).
  const activeChildTodos = getActiveChildTodos(currentMember.id, todos, categories, now);
  const rejectedTodos = getRejectedTodosForMember(currentMember.id, todos);
  const subtaskCards = getAssignedSubtaskCards(currentMember.id, todos, categories, now);

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
      subtaskCards={subtaskCards}
      onToggleSubtask={onToggleSubtask}
      onOpenRecords={() => setView("records")}
      onCreateWish={onCreateWish}
      onCompleteTodo={(todoId, elapsedMs) => onCompleteTodo(currentMember, todoId, rolesRef.current, elapsedMs)}
      onUncompleteTodo={(todoId) => onUncompleteTodo(currentMember, todoId, rolesRef.current)}
      onDismissRejectedTodo={(todoId) => onDismissRejectedTodo(todoId, currentMember.id)}
      onThemePickerOpen={onThemePickerOpen}
    />
  );
}
