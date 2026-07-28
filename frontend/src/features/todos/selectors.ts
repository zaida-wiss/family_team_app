import type { Id, Member, Role, Todo, TodoThreadRange } from "@shared/types";
import { hasPermission } from "../../utils/permissions";

// Delad mellan ParentTodoThreadView.tsx och TodoEditModal.tsx (2026-07-07) —
// avgör om en medlem är ett barn, antingen via member.isChild direkt eller
// via rollens isChildRole (samma två vägar som resten av appen redan kollar).
export function isChildMember(member: Member | undefined, roles: Role[]): boolean {
  if (!member) return false;
  if (member.isChild) return true;
  return roles.find((r) => r.id === member.roleId)?.isChildRole ?? false;
}

// 2026-07-29, Zaidas önskemål: "i inställningar skall vi särskilja på
// barnens uppgifter och övrigas" — delad av RecurringTodosSettings.tsx/
// OneOffTodosSettings.tsx/TodoHistory.tsx, som tidigare alla listade
// barns och vuxnas uppgifter blandat i en enda lista. En otilldelad
// (Familjen) eller vuxen-tilldelad uppgift räknas båda som "Övriga" — bara
// ett riktigt barn-assignerat item hamnar under "Barn".
export function groupByChildAssignee<T extends { assignedTo: Id | null }>(
  items: T[],
  members: Member[],
  roles: Role[]
): { childItems: T[]; otherItems: T[] } {
  const childItems: T[] = [];
  const otherItems: T[] = [];
  for (const item of items) {
    const assignee = members.find((m) => m.id === item.assignedTo);
    if (isChildMember(assignee, roles)) {
      childItems.push(item);
    } else {
      otherItems.push(item);
    }
  }
  return { childItems, otherItems };
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

  // Familjen (2026-07-23): en todo utan tilldelad mottagare (assignedTo:
  // null) hör inte till någon specifik person — ska vara synlig för ALLA i
  // kontot, inte bara den som skapade den, annars kan en delad familje-
  // uppgift bli osynlig för familjemedlemmar utan canSeeAllTodos.
  const isFamilyTodo = (todo: Todo) => todo.assignedTo === null;

  if (hasPermission(member, roles, "canSeeOwnTodos")) {
    return activeTodos.filter((todo) => {
      return todo.assignedTo === member.id || todo.isShared === true || isOwnCreation(todo) || isFamilyTodo(todo);
    });
  }

  return activeTodos.filter((todo) => isOwnCreation(todo) || isFamilyTodo(todo));
}

// allMembers måste vara den ofiltrerade medlemslistan (inte activeMembers) — annars
// kan en todo som tillhör ett borttaget barn inte slå upp namnet längre och visas
// permanent som "Okänt barn" i historiken, trots att medlemmen bara är dold, inte raderad.
export function getAssigneeName(todo: Todo, allMembers: Member[]) {
  if (todo.assignedTo === null) return "Familjen";
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

// Engångsuppgifter (2026-07-08, Zaidas önskemål: en motsvarande lista i
// Inställningar för uppgifter UTAN återkommelse, precis som de återkommande
// mallarna redan har en egen hanteringsyta) — en genuin engångsuppgift, inte
// en daglig occurrence av en återkommande mall (recurringSourceId, syns redan
// som en vanlig boll/rad i Todos-panelen) och inte redan avslutad (hör hemma
// i Todo-historik istället, se isTodoHistory).
export function isOneOffTodo(todo: Todo): boolean {
  return (
    todo.deletedAt === null &&
    todo.recurringSourceId === null &&
    todo.recurrence.type === "none" &&
    !isTodoHistory(todo)
  );
}

// Tidsspannet ("Bara idag"/"En vecka framåt"/"En månad framåt"/"Allt i
// framtiden") gäller nu BÅDE tråd-vyn och listläget (2026-07-27, Zaidas
// önskemål: "todo i inställningar ska gå att välja bara dagens eller
// samtliga även i listvy") — flyttad hit från ParentTodoThreadView.tsx
// (delad av TodosView.tsx för listläget) istället för att dupliceras.
// "Idag" (standard) beter sig precis som tidigare — bara "week"/"month"/
// "all" är nya. "all" har ingen bortre gräns (allt i framtiden), men
// utgångna uppgifter (until <= nu) filtreras fortfarande bort, precis som
// i övriga spann.
function rangeLengthInDays(range: TodoThreadRange): number | null {
  if (range === "today") return 1;
  if (range === "week") return 7;
  if (range === "month") return 30;
  return null;
}

export function isDueWithinRange(todo: Todo, today: Date, range: TodoThreadRange): boolean {
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = rangeLengthInDays(range);
  const rangeEnd = days === null ? Number.POSITIVE_INFINITY : dayStart + days * 24 * 60 * 60 * 1000;
  const from = todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
  const until = todo.expiresAt ? new Date(todo.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return from < rangeEnd && until > dayStart;
}
