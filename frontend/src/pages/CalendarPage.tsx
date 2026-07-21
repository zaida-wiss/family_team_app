import { CalendarView } from "../features/calendars/CalendarView";
import type { CalendarFilter } from "../features/calendars/CalendarView";
import type { Calendar, CalendarEvent, CalendarSettings, CalendarViewMode, Id, Member, Role } from "@shared/types";

type Props = {
  calendars: Calendar[];
  currentMember: Member;
  activeMembers: Member[];
  roles: Role[];
  calendarSettings?: CalendarSettings;
  calendarView?: CalendarViewMode;
  filter: CalendarFilter;
  onCalendarViewChange?: (view: CalendarViewMode) => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onRsvpEvent?: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
  onMonthChange?: (year: number, month: number) => void;
  focusMemberId?: Id;
};

export function CalendarPage({ calendars, currentMember, activeMembers, roles, calendarSettings, calendarView, filter, onCalendarViewChange, onAddEvent, onUpdateEvent, onDeleteEvent, onRsvpEvent, onMonthChange, focusMemberId }: Props) {
  return (
    <CalendarView
      calendars={calendars}
      currentMember={currentMember}
      activeMembers={activeMembers}
      roles={roles}
      calendarSettings={calendarSettings}
      calendarView={calendarView}
      filter={filter}
      onCalendarViewChange={onCalendarViewChange}
      onAddEvent={onAddEvent}
      onUpdateEvent={onUpdateEvent}
      onDeleteEvent={onDeleteEvent}
      onRsvpEvent={onRsvpEvent}
      onMonthChange={onMonthChange}
      focusMemberId={focusMemberId}
    />
  );
}
