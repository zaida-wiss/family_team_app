import { CalendarView } from "../features/calendars/CalendarView";
import type { CalendarFilter } from "../features/calendars/CalendarView";
import type { Calendar, CalendarEvent, CalendarSettings, Id, Member, Role } from "@shared/types";

type Props = {
  calendars: Calendar[];
  currentMember: Member;
  activeMembers: Member[];
  roles: Role[];
  calendarSettings?: CalendarSettings;
  filter: CalendarFilter;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onRsvpEvent?: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
};

export function CalendarPage({ calendars, currentMember, activeMembers, roles, calendarSettings, filter, onAddEvent, onUpdateEvent, onDeleteEvent, onRsvpEvent }: Props) {
  return (
    <CalendarView
      calendars={calendars}
      currentMember={currentMember}
      activeMembers={activeMembers}
      roles={roles}
      calendarSettings={calendarSettings}
      filter={filter}
      onAddEvent={onAddEvent}
      onUpdateEvent={onUpdateEvent}
      onDeleteEvent={onDeleteEvent}
      onRsvpEvent={onRsvpEvent}
    />
  );
}
