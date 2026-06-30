import { MemberOverview } from "../features/layout/MemberOverview";
import type { CalendarFilter } from "../features/calendars/CalendarView";
import type { Calendar, CalendarEvent, CalendarSettings, Id, Member, Role } from "@shared/types";

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
};

export function HomePage({ currentMember, accountName, roles, activeMembers, selectedMemberId, calendars, canSeeCalendar, calendarSettings, calendarFilter, onSelectMember, onOpenCalendar, onAddEvent, onUpdateEvent, onDeleteEvent, onLoadEventsForMonth }: Props) {
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
    />
  );
}
