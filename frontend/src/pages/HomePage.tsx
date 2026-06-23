import { useState } from "react";
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
  onSelectMember: (memberId: string) => void;
  onOpenCalendar?: () => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
};

export function HomePage({ currentMember, accountName, roles, activeMembers, selectedMemberId, calendars, canSeeCalendar, calendarSettings, onSelectMember, onOpenCalendar, onAddEvent, onUpdateEvent, onDeleteEvent }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(new Set());

  const calendarFilter: CalendarFilter = { searchQuery, setSearchQuery, hiddenCalendarIds, setHiddenCalendarIds };

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
    />
  );
}
