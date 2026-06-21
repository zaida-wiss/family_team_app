import type { Member, Reward, RewardPathItem, RewardPathProgress, Role, Todo } from "@shared/types";
import { hasPermission } from "../roles/permissions";

export function getVisibleTodos(
  member: Member,
  roles: Role[],
  todos: Todo[]
): Todo[] {
  const activeTodos = todos.filter((todo) => todo.deletedAt === null);

  if (hasPermission(member, roles, "canSeeAllTodos")) {
    return activeTodos;
  }

  if (hasPermission(member, roles, "canSeeOwnTodos")) {
    return activeTodos.filter((todo) => {
      return todo.assignedTo === member.id || todo.isShared === true;
    });
  }

  return [];
}

export function getRewardPathProgress(
  child: Member,
  reward: Reward,
  todos: Todo[]
): RewardPathProgress {
  const childTodos = todos.filter((todo) => {
    return todo.assignedTo === child.id && todo.deletedAt === null;
  });

  const approvedStars = childTodos
    .filter((todo) => todo.status === "approved")
    .reduce((sum, todo) => sum + todo.starValue, 0);

  const pendingTaskImages = childTodos.filter((todo) => todo.status === "done");
  const rejectedTodos = childTodos.filter((todo) => todo.status === "rejected");

  const pathItems = childTodos
    .filter((todo) => todo.status === "done" || todo.status === "approved")
    .sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return timeA - timeB;
    })
    .flatMap((todo): RewardPathItem[] => {
      if (todo.status === "approved") {
        return Array.from({ length: todo.starValue }, () => ({ type: "approved-star" as const }));
      }
      return [{ type: "pending-task" as const, todo }];
    });

  return {
    childId: child.id,
    rewardId: reward.id,
    approvedStars,
    pendingTaskImages,
    rejectedTodos,
    pathItems,
    starsLeft: Math.max(reward.starsNeeded - approvedStars, 0),
    isUnlocked: approvedStars >= reward.starsNeeded
  };
}
