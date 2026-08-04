import type { Id, Member, Role, Todo, TodoCategory, TodoSubtask, TodoThreadRange } from "@shared/types";
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

// Todos-panelen omdefinierad (2026-07-31, Zaidas önskemål: "i min egen
// todo vy skall endast mina egna todos finnas... De todos som är
// assignade på mig skall visas i todovyn") — till skillnad från
// getVisibleTodos (som en canSeeAllTodos-medlem ser ALLT igenom, inklusive
// andras privata personliga kategorier och familje-/barn-uppgifter) visar
// Todos-panelen numera BARA det som är tilldelat mig direkt (oavsett vems
// personliga kategori uppgiften råkar ligga i — täcker både mina egna
// personliga uppgifter, som alltid tilldelas en själv vid skapande, OCH en
// uppgift en ANNAN vuxen tilldelat mig i EN AV DERAS kategorier, tidigare
// osynlig här). Familjen-todos (assignedTo: null) hör numera ENDAST hemma
// i Hem-vyn (se getFamilyViewTodos) — även om jag själv skapade dem.
// includeChildren styrs av den nya inställnings-togglen
// (Member.showChildTodosInOwnView), av som standard.
//
// 2026-08-01, Zaidas rättelse (samma dag som ett kort försök att lägga
// signade Familjen-todos i "Mina uppgifter" här) — signade uppgifter ska
// INTE blandas in i "Mina uppgifter", utan visas i en EGEN tråd per familj
// (namngiven efter familjen), se TodosView.tsx/FamilyTodoThreads.tsx. Den
// här funktionen rör alltså bara det som är DIREKT tilldelat mig, oförändrad
// sedan 2026-07-31.
export function getMyTodosViewTodos(
  currentMember: Member,
  roles: Role[],
  members: Member[],
  todos: Todo[],
  includeChildren: boolean
): Todo[] {
  return todos.filter((todo) => {
    if (todo.deletedAt !== null) return false;
    if (todo.assignedTo === currentMember.id) return true;
    if (includeChildren && todo.assignedTo !== null) {
      return isChildMember(members.find((m) => m.id === todo.assignedTo), roles);
    }
    return false;
  });
}

// Hem-vyns familjevy (2026-07-31, samma önskemål: "Todos som tillhör
// familjen eller alla (vuxna) skall visas i familjevyn. Mina privata
// todos... skall inte visas i familjevyns todo.") — familjen (assignedTo:
// null) ELLER tilldelad en VUXEN (vem som helst, inte bara jag), men ALDRIG
// en todo med en PERSONLIG kategori satt (personalCategoryId) — en personlig
// kategori är per definition ett privat organiseringsverktyg (tråd-vyns
// kolumner visar bara ägarens EGNA kategorier, aldrig andras). Barnens
// tilldelade uppgifter räknas medvetet INTE som "alla (vuxna)".
//
// 2026-08-03 utökad med riktiga familjekategorier (Zaidas önskemål: "lägga
// till kategorier... i familjevyn") — en todo vars personalCategoryId pekar
// på en KATEGORI MED isFamily:true hör hemma här (en egen tråd per
// familjekategori, se MemberShellContent.tsx), till skillnad från en
// personlig kategori som fortsatt utesluts helt.
export function getFamilyViewTodos(
  todos: Todo[],
  roles: Role[],
  members: Member[],
  categories: TodoCategory[]
): Todo[] {
  const familyCategoryIds = new Set(categories.filter((c) => c.isFamily).map((c) => c.id));
  return todos.filter((todo) => {
    if (todo.deletedAt !== null) return false;
    if (todo.personalCategoryId != null && !familyCategoryIds.has(todo.personalCategoryId)) return false;
    if (todo.assignedTo === null) return true;
    return !isChildMember(members.find((m) => m.id === todo.assignedTo), roles);
  });
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

// Avklarade delmoment längst ner i checklistan (2026-08-04, Zaidas önskemål)
// — bara för LÄS-/bock-av-vyer (TodoDetailView.tsx), inte för redigera-
// modalernas egen delmoment-editor (TodoCreatorModal.tsx/TodoEditModal.tsx),
// som saknar en done-status att visa och där ordningen istället styrs
// medvetet manuellt via upp/ner-pilarna (moveSubtask) — att sortera om
// DÄR hade gjort pilarnas index missvisande mot vad som faktiskt syns.
// Stabil sort (Array.prototype.sort, garanterat stabil sedan ES2019) —
// bevarar den sparade inbördes ordningen inom både den obockade och den
// bockade gruppen.
export function sortSubtasksForDisplay(subtasks: TodoSubtask[]): TodoSubtask[] {
  return [...subtasks].sort((a, b) => Number(a.done) - Number(b.done));
}
