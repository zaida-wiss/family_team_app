import type { Member, Role, Todo } from "@shared/types";
import { hasPermission } from "../../utils/permissions";

// Delad mellan ParentTodoThreadView.tsx och TodoEditModal.tsx (2026-07-07) —
// avgör om en medlem är ett barn, antingen via member.isChild direkt eller
// via rollens isChildRole (samma två vägar som resten av appen redan kollar).
export function isChildMember(member: Member | undefined, roles: Role[]): boolean {
  if (!member) return false;
  if (member.isChild) return true;
  return roles.find((r) => r.id === member.roleId)?.isChildRole ?? false;
}

export function getVisibleTodos(
  member: Member,
  roles: Role[],
  todos: Todo[]
): Todo[] {
  const activeTodos = todos.filter((todo) => todo.deletedAt === null);

  if (hasPermission(member, roles, "canSeeAllTodos")) {
    return activeTodos;
  }

  // Skaparen ska alltid kunna se (och därmed redigera/ta bort) sina egna uppgifter,
  // oavsett rollens se-behörighet — annars kan en uppgift tilldelad någon annan bli
  // permanent osynlig och oredigerbar för den som skapade den, utan felmeddelande.
  const isOwnCreation = (todo: Todo) => todo.createdBy === member.id;

  if (hasPermission(member, roles, "canSeeOwnTodos")) {
    return activeTodos.filter((todo) => {
      return todo.assignedTo === member.id || todo.isShared === true || isOwnCreation(todo);
    });
  }

  return activeTodos.filter(isOwnCreation);
}

// allMembers måste vara den ofiltrerade medlemslistan (inte activeMembers) — annars
// kan en todo som tillhör ett borttaget barn inte slå upp namnet längre och visas
// permanent som "Okänt barn" i historiken, trots att medlemmen bara är dold, inte raderad.
export function getAssigneeName(todo: Todo, allMembers: Member[]) {
  return allMembers.find((member) => member.id === todo.assignedTo)?.name ?? "Okänt barn";
}

// Avslutade uppgifter (S3, Sprint 3) — flyttade ur den aktiva Todos-vyn till
// Inställningar för att den aktiva vyn inte ska samla på sig historik i all evighet.
// Zaida: "historiken (utgångna/avklarade todos)" — expired hör alltså till historiken,
// inte bara godkända/nekade (missades i första versionen av S3).
export function isTodoHistory(todo: Todo): boolean {
  return todo.status === "approved" || todo.status === "rejected" || todo.status === "expired";
}

function historySortDate(todo: Todo): number {
  return new Date(todo.approvedAt ?? todo.rejectedAt ?? todo.expiresAt ?? 0).getTime();
}

export function getTodoHistory(member: Member, roles: Role[], todos: Todo[]): Todo[] {
  return getVisibleTodos(member, roles, todos)
    .filter(isTodoHistory)
    .sort((a, b) => historySortDate(b) - historySortDate(a));
}
