import type { Member, Role, Todo } from "@shared/types";
import { hasPermission } from "../../utils/permissions";

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
export function isTodoHistory(todo: Todo): boolean {
  return todo.status === "approved" || todo.status === "rejected";
}

export function getTodoHistory(member: Member, roles: Role[], todos: Todo[]): Todo[] {
  return getVisibleTodos(member, roles, todos)
    .filter(isTodoHistory)
    .sort((a, b) => {
      const aTime = new Date(a.approvedAt ?? a.rejectedAt ?? 0).getTime();
      const bTime = new Date(b.approvedAt ?? b.rejectedAt ?? 0).getTime();
      return bTime - aTime;
    });
}
