import { ChildDashboard } from "./ChildDashboard";
import { getRewardPathProgress } from "../todos/selectors";
import type { Calendar, Member, Reward, Role, Todo } from "@shared/types";

type Props = {
  currentMember: Member;
  calendars: Calendar[];
  todos: Todo[];
  rewards: Reward[];
  roles: Role[];
  wishTitle: string;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: string, starsNeeded: number) => void;
  onCompleteTodo: (member: Member, todoId: string, roles: Role[]) => void;
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
  rewards,
  roles,
  wishTitle,
  onSetWishTitle,
  onCreateWish,
  onCompleteTodo,
  onDismissRejectedTodo,
  onThemePickerOpen
}: Props) {
  const activeReward =
    rewards.find((r) => r.wishedBy === currentMember.id && r.status === "active") ?? null;
  const rewardProgress = activeReward
    ? getRewardPathProgress(currentMember, activeReward, todos)
    : null;
  const childRewards = rewards.filter((r) => r.wishedBy === currentMember.id);
  const now = Date.now();
  const activeChildTodos = todos.filter(
    (t) =>
      t.assignedTo === currentMember.id &&
      t.status === "pending" &&
      t.recurrence.type === "none" &&
      t.deletedAt === null &&
      isTodoVisibleNow(t, now)
  );
  const rejectedTodos = todos.filter(
    (t) =>
      t.assignedTo === currentMember.id &&
      t.status === "rejected" &&
      t.deletedAt === null
  );

  return (
    <ChildDashboard
      child={currentMember}
      calendars={calendars}
      roles={roles}
      activeReward={activeReward}
      rewardProgress={rewardProgress}
      childRewards={childRewards}
      timelineTodos={todos}
      activeChildTodos={activeChildTodos}
      rejectedTodos={rejectedTodos}
      wishTitle={wishTitle}
      onSetWishTitle={onSetWishTitle}
      onCreateWish={onCreateWish}
      onCompleteTodo={(todoId) => onCompleteTodo(currentMember, todoId, roles)}
      onDismissRejectedTodo={(todoId) => onDismissRejectedTodo(todoId, currentMember.id)}
      onThemePickerOpen={onThemePickerOpen}
    />
  );
}
