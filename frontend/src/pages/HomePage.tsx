import { MemberOverview } from "../features/layout/MemberOverview";
import type { CalendarFilter } from "../features/calendars/CalendarView";
import type { CrossAccountRecipes } from "../api/recipes";
import type {
  Calendar, CalendarEvent, CalendarSettings, Id, Member, MembershipMemberSummary, Recipe, Role, ShoppingList, Todo
} from "@shared/types";

type Props = {
  currentMember: Member;
  accountName: string;
  roles: Role[];
  activeMembers: Member[];
  selectedMemberId: string;
  calendars: Calendar[];
  canSeeCalendar: boolean;
  calendarSettings?: CalendarSettings;
  calendarFilter: CalendarFilter;
  onSelectMember: (memberId: string) => void;
  onOpenCalendar?: () => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onLoadEventsForMonth?: (year: number, month: number) => Promise<void>;
  fixedCalendarTimes?: boolean;
  todos?: Todo[];
  canSeeTodos?: boolean;
  onOpenTodos?: () => void;
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
  // accountId + todoId — en vald familj kan vara ett HELT ANNAT konto än
  // mitt eget (2026-08-01), se MemberOverview.tsx/MemberShellContent.tsx.
  onClaimTodo?: (accountId: Id, todoId: Id, claim: boolean) => void;
  onCreateFamilyTodo?: (accountId: Id, title: string, visual: string | null) => void;
  claimableFamilyAccountIds?: Set<Id>;
  creatableFamilyAccountIds?: Set<Id>;
  // Ny inköpslista, förinställd på familjen (2026-08-01) — ENDAST mitt eget
  // konto eller Mina familjekonton, se MemberShellContent.tsx.
  onCreateFamilyShoppingList?: (accountId: Id, name: string) => void;
  shoppingCreatableFamilyAccountIds?: Set<Id>;
  // "vald vuxen"-vyn (Medlemmar-panelen) sätter false — se MemberOverview.tsx.
  enableTabs?: boolean;
};

export function HomePage({
  currentMember, accountName, roles, activeMembers, selectedMemberId, calendars, canSeeCalendar,
  calendarSettings, calendarFilter, onSelectMember, onOpenCalendar, onAddEvent, onUpdateEvent, onDeleteEvent,
  onLoadEventsForMonth, fixedCalendarTimes, todos, canSeeTodos, onOpenTodos, shoppingLists, canSeeShopping,
  onOpenShopping, canSeeMembers, familyOptions, extraMembers, recipes, crossAccountRecipeGroups,
  homeSelectedFamilyId, onUpdateHomeSelectedFamilyId,
  onClaimTodo, onCreateFamilyTodo, claimableFamilyAccountIds, creatableFamilyAccountIds,
  onCreateFamilyShoppingList, shoppingCreatableFamilyAccountIds, enableTabs
}: Props) {
  return (
    <MemberOverview
      currentMember={currentMember}
      accountName={accountName}
      roles={roles}
      activeMembers={activeMembers}
      selectedMemberId={selectedMemberId}
      calendars={calendars}
      canSeeCalendar={canSeeCalendar}
      calendarSettings={calendarSettings}
      calendarFilter={calendarFilter}
      onSelectMember={onSelectMember}
      onOpenCalendar={onOpenCalendar}
      onAddEvent={onAddEvent}
      onUpdateEvent={onUpdateEvent}
      onDeleteEvent={onDeleteEvent}
      onLoadEventsForMonth={onLoadEventsForMonth}
      fixedCalendarTimes={fixedCalendarTimes}
      todos={todos}
      canSeeTodos={canSeeTodos}
      onOpenTodos={onOpenTodos}
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
      onClaimTodo={onClaimTodo}
      onCreateFamilyTodo={onCreateFamilyTodo}
      claimableFamilyAccountIds={claimableFamilyAccountIds}
      creatableFamilyAccountIds={creatableFamilyAccountIds}
      onCreateFamilyShoppingList={onCreateFamilyShoppingList}
      shoppingCreatableFamilyAccountIds={shoppingCreatableFamilyAccountIds}
      enableTabs={enableTabs}
    />
  );
}
