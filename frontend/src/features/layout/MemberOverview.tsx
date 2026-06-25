import { CalendarView } from "../calendars/CalendarView";
import type { CalendarFilter } from "../calendars/CalendarView";
import type { Calendar, CalendarEvent, CalendarSettings, Id, Member, Role } from "@shared/types";
import styles from "./MemberOverview.module.css";

type Props = {
  currentMember: Member;
  accountName: string;
  roles: Role[];
  activeMembers: Member[];
  selectedMemberId: string;
  calendars: Calendar[];
  canSeeCalendar: boolean;
  calendarFilter?: CalendarFilter;
  onSelectMember: (memberId: string) => void;
  onOpenCalendar?: () => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  calendarSettings?: CalendarSettings;
};

export function MemberOverview({
  currentMember,
  accountName,
  roles,
  activeMembers,
  calendars,
  canSeeCalendar,
  calendarFilter,
  onOpenCalendar,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  calendarSettings,
}: Props) {
  return (
    <div className={styles.home}>
      {canSeeCalendar && (
        <div className={styles.calendarWrap}>
          <div className={styles.calendarToolbar}>
            <span className={styles.calendarLabel}>Familjens kalender</span>
          </div>
          <CalendarView
            displayOnly
            calendars={calendars}
            currentMember={currentMember}
            activeMembers={activeMembers}
            roles={roles}
            calendarSettings={calendarSettings}
            filter={calendarFilter}
            onAddEvent={onAddEvent}
            onUpdateEvent={onUpdateEvent}
            onDeleteEvent={onDeleteEvent}
          />
        </div>
      )}
    </div>
  );
}
