import { MemberOverview } from "../features/layout/MemberOverview";
import type { CalendarFilter } from "../features/calendars/CalendarView";
import type { CrossAccountRecipes } from "../api/recipes";
import type { FamilyThreadSource } from "../features/todos/FamilyTodoThreads";
import type { ImportResult, ImportUndo } from "../features/todos/useTodosState";
import type {
  Calendar, CalendarEvent, CalendarSettings, Id, Member, MembershipMemberSummary, Recipe, Role, ShoppingList,
  Todo, TodoCategory, TodoThreadRange
} from "@shared/types";

type Props = {
  currentMember: Member;
  roles: Role[];
  activeMembers: Member[];
  selectedMemberId: string;
  calendars: Calendar[];
  canSeeCalendar: boolean;
  calendarSettings?: CalendarSettings;
  calendarFilter: CalendarFilter;
  onSelectMember: (memberId: string) => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onLoadEventsForMonth?: (year: number, month: number) => Promise<void>;
  fixedCalendarTimes?: boolean;
  canSeeTodos?: boolean;
  shoppingLists?: ShoppingList[];
  canSeeShopping?: boolean;
  onOpenShopping?: () => void;
  canSeeMembers?: boolean;
  // Familjefilter (2026-07-31) — se MemberOverview.tsx.
  familyOptions?: { accountId: Id; accountName: string }[];
  extraMembers?: (MembershipMemberSummary & { accountId: Id })[];
  recipes?: Recipe[];
  // Mina familjekonton (2026-08-01) — recept i en av mina andra genuina
  // medlemskap, för måltidsplaneringen. ALDRIG Familjeanslutningar.
  crossAccountRecipeGroups?: CrossAccountRecipes[];
  homeSelectedFamilyId?: Id | null;
  onUpdateHomeSelectedFamilyId?: (id: Id | null) => void;
  // Hem-vyns familjetrådar (2026-08-01, Zaidas önskemål: "hemvyn skall vara
  // återanvändbara moduler med samma logik som i navbarens vyer... man skall
  // signa upp sig på en uppgift på samma sätt som i todovyn med bollar i
  // trådar") — redan hopkopplade per familj, se FamilyTodoThreads.tsx.
  familyThreadSources?: FamilyThreadSource[];
  todoBubbleOrder?: Record<Id, Id[]>;
  onReorderBubbles?: (threadId: Id, order: Id[]) => void;
  familyThreadOrder?: Id[];
  onReorderFamilyThreads?: (order: Id[]) => void;
  todoThreadGap?: number;
  todoBubbleSize?: number;
  // Tidsspann (2026-08-04, Zaidas fynd) — se MemberOverview.tsx.
  todoThreadRange?: TodoThreadRange;
  // Ny inköpslista, förinställd på familjen (2026-08-01) — ENDAST mitt eget
  // konto eller Mina familjekonton, se MemberShellContent.tsx.
  onCreateFamilyShoppingList?: (accountId: Id, name: string) => void;
  shoppingCreatableFamilyAccountIds?: Set<Id>;
  // Sökruta/plus-knapp/import-export i Todos-fliken (2026-08-03) — se
  // MemberOverview.tsx.
  members?: Member[];
  categories?: TodoCategory[];
  onCreateCategory?: (name: string, isFamily?: boolean) => Promise<TodoCategory>;
  onCreateTodo?: (todo: Todo) => void;
  onUpdateTodo?: (todoId: Id, patch: Partial<Todo>) => void;
  onDeleteTodo?: (todoId: Id) => void;
  todoImportResult?: ImportResult | null;
  onSetTodoImportResult?: (result: ImportResult | null) => void;
  todoImportUndo?: ImportUndo | null;
  onSetTodoImportUndo?: (undo: ImportUndo | null) => void;
  // "vald vuxen"-vyn (Medlemmar-panelen) sätter false — se MemberOverview.tsx.
  enableTabs?: boolean;
};

export function HomePage({
  currentMember, roles, activeMembers, selectedMemberId, calendars, canSeeCalendar,
  calendarSettings, calendarFilter, onSelectMember, onAddEvent, onUpdateEvent, onDeleteEvent,
  onLoadEventsForMonth, fixedCalendarTimes, canSeeTodos, shoppingLists, canSeeShopping,
  onOpenShopping, canSeeMembers, familyOptions, extraMembers, recipes, crossAccountRecipeGroups,
  homeSelectedFamilyId, onUpdateHomeSelectedFamilyId,
  familyThreadSources, todoBubbleOrder, onReorderBubbles, familyThreadOrder, onReorderFamilyThreads,
  todoThreadGap, todoBubbleSize, todoThreadRange,
  onCreateFamilyShoppingList, shoppingCreatableFamilyAccountIds,
  members, categories, onCreateCategory, onCreateTodo, onUpdateTodo, onDeleteTodo,
  todoImportResult, onSetTodoImportResult, todoImportUndo, onSetTodoImportUndo,
  enableTabs
}: Props) {
  return (
    <MemberOverview
      currentMember={currentMember}
      roles={roles}
      activeMembers={activeMembers}
      selectedMemberId={selectedMemberId}
      calendars={calendars}
      canSeeCalendar={canSeeCalendar}
      calendarSettings={calendarSettings}
      calendarFilter={calendarFilter}
      onSelectMember={onSelectMember}
      onAddEvent={onAddEvent}
      onUpdateEvent={onUpdateEvent}
      onDeleteEvent={onDeleteEvent}
      onLoadEventsForMonth={onLoadEventsForMonth}
      fixedCalendarTimes={fixedCalendarTimes}
      canSeeTodos={canSeeTodos}
      shoppingLists={shoppingLists}
      canSeeShopping={canSeeShopping}
      onOpenShopping={onOpenShopping}
      canSeeMembers={canSeeMembers}
      familyOptions={familyOptions}
      extraMembers={extraMembers}
      recipes={recipes}
      crossAccountRecipeGroups={crossAccountRecipeGroups}
      homeSelectedFamilyId={homeSelectedFamilyId}
      onUpdateHomeSelectedFamilyId={onUpdateHomeSelectedFamilyId}
      familyThreadSources={familyThreadSources}
      todoBubbleOrder={todoBubbleOrder}
      onReorderBubbles={onReorderBubbles}
      familyThreadOrder={familyThreadOrder}
      onReorderFamilyThreads={onReorderFamilyThreads}
      todoThreadGap={todoThreadGap}
      todoBubbleSize={todoBubbleSize}
      todoThreadRange={todoThreadRange}
      onCreateFamilyShoppingList={onCreateFamilyShoppingList}
      shoppingCreatableFamilyAccountIds={shoppingCreatableFamilyAccountIds}
      members={members}
      categories={categories}
      onCreateCategory={onCreateCategory}
      onCreateTodo={onCreateTodo}
      onUpdateTodo={onUpdateTodo}
      onDeleteTodo={onDeleteTodo}
      todoImportResult={todoImportResult}
      onSetTodoImportResult={onSetTodoImportResult}
      todoImportUndo={todoImportUndo}
      onSetTodoImportUndo={onSetTodoImportUndo}
      enableTabs={enableTabs}
    />
  );
}
