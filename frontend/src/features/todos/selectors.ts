import type { Id, Member, Role, Todo, TodoCategory, TodoSubtask, TodoThreadRange } from "@shared/types";
import { hasPermission } from "../../utils/permissions";
import { extractLeadingEmoji } from "../../utils/extractLeadingEmoji";
import { toLocalDateStr } from "../calendars/calendarHelpers";

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
      return todo.assignedTo === member.id || isOwnCreation(todo) || isFamilyTodo(todo);
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
// signade Familjen-todos i denna funktions resultat) — en signad uppgift
// ska INTE blandas in här, utan visas i en EGEN tråd per familj (namngiven
// efter familjen), se TodosView.tsx/FamilyTodoThreads.tsx. Den här
// funktionen rör alltså bara det som är DIREKT tilldelat mig, oförändrad
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

// Exakt klockslags-gating (2026-08-04, Zaidas önskemål: "visaren skall
// endast visas idag, så uppgifter som har gått ut, eller inte har börjat än
// skall inte visas") — till skillnad från isDueWithinRange (dag-baserad,
// visar en uppgift HELA dagen oavsett exakt klockslag) kräver denna att
// NU verkligen ligger mellan visibleFrom och expiresAt. Var tidigare
// duplicerad lokalt i MemberShellContent.tsx/ChildShellContent.tsx — flyttad
// hit som en delad helper, nu även använd av ParentTodoThreadView.tsx/
// FamilyTodoThreads.tsx för "idag"-tidsspannet (samma hybrid-princip som
// redan gällde PersonalDashboard sedan tidigare samma dag: "idag" = exakt
// klockslag, "vecka"/"månad"/"allt" = dag-baserad isDueWithinRange).
export function isTodoVisibleNow(
  todo: { visibleFrom: string | null; expiresAt: string | null },
  now: number
): boolean {
  const from = todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
  const until = todo.expiresAt ? new Date(todo.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return from <= now && now < until;
}

// Dashboardens uppdragskort (2026-08-13, Zaidas önskemål: "det som har
// närmast till sluttid skall komma först, de som inte har någon sluttid
// skall komma sist... som andra sortering skall de uppdrag med starttid
// först komma först (om sluttiden är exakt samma)") — delad av
// ChildShellContent.tsx och MemberShellContent.tsx, som tidigare hade var
// sin kopia av en enklare sortering (bara stigande visibleFrom). Signaturen
// tar bara de två tidsfälten (inte hela Todo) så att AssignedSubtaskCard
// (som ärver dem från sin förälder-todo, se getAssignedSubtaskCards) kan
// sorteras med SAMMA funktion, i samma lista som de vanliga korten.
export function compareTodosByEndThenStart(
  a: { visibleFrom: string | null; expiresAt: string | null },
  b: { visibleFrom: string | null; expiresAt: string | null }
): number {
  const aEnd = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  const bEnd = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  if (aEnd !== bEnd) return aEnd - bEnd;
  const aStart = a.visibleFrom ? new Date(a.visibleFrom).getTime() : 0;
  const bStart = b.visibleFrom ? new Date(b.visibleFrom).getTime() : 0;
  return aStart - bStart;
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

export type AssignedSubtaskCard = {
  todoId: Id;
  subtaskId: Id;
  title: string;
  emoji: string | null;
  // Ärvda från förälder-todon (2026-08-13, Zaidas önskemål: "har
  // deluppgifterna fått huvuduppgiftens sluttid?" — delmomentet har inget
  // eget tidsfönster, se TodoSubtask i shared/types.ts) — så att
  // compareTodosByEndThenStart kan sortera delmoment-kort IN BLAND de
  // vanliga korten i EN gemensam lista, se ChildTasksSection.tsx, istället
  // för en egen osorterad klump sist.
  visibleFrom: string | null;
  expiresAt: string | null;
};

// Uppdragskort för tilldelade DELMOMENT (2026-08-12, Zaidas önskemål:
// "delmoment man är signad på hamnar på dashboarden, gärna emojin vid start
// med") — ett delmoment kan vara tilldelat en ANNAN medlem än den todon i
// sig tillhör (SubtaskAssigneeButton.tsx, 2026-07-23), så denna går igenom
// ALLA todos oavsett todo.assignedTo, till skillnad från activeChildTodos
// (ChildShellContent.tsx/MemberShellContent.tsx) som bara ser på hela
// todons egen tilldelning. Samma synlighetsvillkor som activeChildTodos
// (status pending/expired, ingen mall, inte en dold kategori, inom
// tidsfönstret) — annars skulle ett delmoment i en ännu inte startad eller
// redan avklarad rutin dyka upp på dashboarden i onödan.
export function getAssignedSubtaskCards(
  memberId: Id,
  todos: Todo[],
  categories: TodoCategory[],
  now: number
): AssignedSubtaskCard[] {
  const cards: AssignedSubtaskCard[] = [];
  for (const todo of todos) {
    if (todo.deletedAt !== null) continue;
    if (todo.status !== "pending" && todo.status !== "expired") continue;
    if (todo.recurrence.type !== "none") continue;
    if (!isTodoVisibleNow(todo, now)) continue;
    if (todo.personalCategoryId && categories.find((c) => c.id === todo.personalCategoryId)?.hidden) continue;

    for (const subtask of todo.subtasks ?? []) {
      if (subtask.done || subtask.assignedTo !== memberId) continue;
      const { emoji, rest } = extractLeadingEmoji(subtask.title);
      cards.push({
        todoId: todo.id,
        subtaskId: subtask.id,
        title: rest || subtask.title,
        emoji,
        visibleFrom: todo.visibleFrom,
        expiresAt: todo.expiresAt,
      });
    }
  }
  return cards;
}

// Familjen-poolens tråd-etikett (2026-08-07, Zaidas önskemål: "den ska
// istället heta Wiss Kolmodin om den aktuella Familjen heter så. Heter
// Familjen Andersson, är det just Andersson denna uppsamlingskategori...
// skall heta") — samma princip som cross-account/anslutnings-trådarna
// redan använder (rakt av kontonamnet, se homeFamilyThreadSources i
// MemberShellContent.tsx), bara med "Familjen "-prefixet bortstripat om
// det finns. Ett konto utan prefixet (t.ex. "Wiss Kolmodin") lämnas orört.
export function familyPoolLabel(accountName: string): string {
  const stripped = accountName.replace(/^Familjen\s+/i, "").trim();
  return stripped || accountName;
}

export type FamilyCompletedTimelineItem = {
  id: string;
  title: string;
  emoji: string | null;
  completedAt: string;
  assigneeId: Id | null;
};

// Hela familjens avklarade dag, som ikoner på en vågrät tidslinje
// (FamilyCompletedTimeline.tsx, 2026-08-12, Zaidas önskemål: "hela
// familjens samlade avklarade todos (även deluppgifter)... vågrät
// tidslinje över dagen"). Samma "avklarat"-definition som den lodräta
// per-persons ChildTimeline.tsx redan använder: status "done" (väntar
// godkännande) ELLER "approved" räknas båda, inte bara godkända — annars
// hade tidslinjen inte visat något förrän en förälder hunnit godkänna.
// Delmoment har EGEN completedAt (2026-08-12) och räknas oberoende av
// hela todons status — ett delmoment kan vara avklarat mitt i en ännu
// pågående (pending) rutin.
export function getFamilyCompletedTimelineItems(todos: Todo[], day: Date): FamilyCompletedTimelineItem[] {
  const dayStr = toLocalDateStr(day);
  const isToday = (isoStr: string) => toLocalDateStr(new Date(isoStr)) === dayStr;
  const items: FamilyCompletedTimelineItem[] = [];

  for (const todo of todos) {
    if (todo.deletedAt !== null) continue;

    if (
      (todo.status === "done" || todo.status === "approved") &&
      todo.completedAt !== null &&
      isToday(todo.completedAt)
    ) {
      items.push({
        id: `todo:${todo.id}`,
        title: todo.title,
        emoji: todo.visual.value || null,
        completedAt: todo.completedAt,
        assigneeId: todo.assignedTo
      });
    }

    for (const subtask of todo.subtasks ?? []) {
      if (!subtask.done || !subtask.completedAt || !isToday(subtask.completedAt)) continue;
      const { emoji, rest } = extractLeadingEmoji(subtask.title);
      items.push({
        id: `subtask:${todo.id}:${subtask.id}`,
        title: rest || subtask.title,
        emoji,
        completedAt: subtask.completedAt,
        assigneeId: subtask.assignedTo ?? todo.assignedTo
      });
    }
  }

  return items.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

export type CompletedStatsDay = {
  dateStr: string;
  count: number;
};

// Bucketerar rå completedAt-tidsstämplar (todosApi.getCompletedStats) per
// LOKAL dag (2026-08-15) — samma toLocalDateStr som getFamilyCompletedTimelineItems
// använder för "idag", så en uppgift avklarad t.ex. 23:50 lokal tid hamnar i
// samma dag här som i "Idag i familjen"-listan, inte en dag senare via UTC.
// `days` dagar tillbaka INKLUSIVE idag, äldst först (passar direkt in i en
// stapeldiagram-rendering utan omvänd loop i UI-lagret).
export function bucketCompletedStatsByDay(timestamps: string[], today: Date, days: number): CompletedStatsDay[] {
  const counts = new Map<string, number>();
  for (const iso of timestamps) {
    const dateStr = toLocalDateStr(new Date(iso));
    counts.set(dateStr, (counts.get(dateStr) ?? 0) + 1);
  }

  const buckets: CompletedStatsDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const dateStr = toLocalDateStr(day);
    buckets.push({ dateStr, count: counts.get(dateStr) ?? 0 });
  }
  return buckets;
}
