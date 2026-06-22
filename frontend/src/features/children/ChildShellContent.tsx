import { ChildDashboard } from "./ChildDashboard";
import { getRewardPathProgress } from "../todos/selectors";
import type { Member, Reward, Role, Todo } from "@shared/types";

type Props = {
  currentMember: Member;
  todos: Todo[];
  rewards: Reward[];
  roles: Role[];
  wishTitle: string;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: string) => void;
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
  const suggestedRewards = rewards.filter(
    (r) => r.wishedBy === currentMember.id && r.status === "suggested"
  );
  const now = Date.now();
  const activeChildTodos = todos.filter(
    (t) =>
      t.assignedTo === currentMember.id &&
      t.status === "pending" &&
      t.recurrence.type === "none" &&
      t.deletedAt === null &&
      isTodoVisibleNow(t, now)
  );

  return (
    <ChildDashboard
      child={currentMember}
      activeReward={activeReward}
      rewardProgress={rewardProgress}
      suggestedRewards={suggestedRewards}
      activeChildTodos={activeChildTodos}
      wishTitle={wishTitle}
      onSetWishTitle={onSetWishTitle}
      onCreateWish={onCreateWish}
      onCompleteTodo={(todoId) => onCompleteTodo(currentMember, todoId, roles)}
      onDismissRejectedTodo={(todoId) => onDismissRejectedTodo(todoId, currentMember.id)}
      onThemePickerOpen={onThemePickerOpen}
    />
  );
}
