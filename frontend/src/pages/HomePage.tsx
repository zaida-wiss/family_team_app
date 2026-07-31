import { MemberOverview } from "../features/layout/MemberOverview";
import type { CalendarFilter } from "../features/calendars/CalendarView";
import type {
  Calendar, CalendarEvent, CalendarSettings, Id, Member, MembershipMemberSummary, Role, ShoppingList, Todo
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
};

export function HomePage({
  currentMember, accountName, roles, activeMembers, selectedMemberId, calendars, canSeeCalendar,
  calendarSettings, calendarFilter, onSelectMember, onOpenCalendar, onAddEvent, onUpdateEvent, onDeleteEvent,
  onLoadEventsForMonth, fixedCalendarTimes, todos, canSeeTodos, onOpenTodos, shoppingLists, canSeeShopping,
  onOpenShopping, canSeeMembers, familyOptions, extraMembers
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
    />
  );
}
