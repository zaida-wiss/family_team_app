import { CalendarView } from "../calendars/CalendarView";
import type { Calendar, Member, Role } from "@shared/types";

type Props = {
  currentMember: Member;
  accountName: string;
  roles: Role[];
  activeMembers: Member[];
  selectedMemberId: string;
  calendars: Calendar[];
  canSeeCalendar: boolean;
  onSelectMember: (memberId: string) => void;
  onOpenCalendar?: () => void;
};

export function MemberOverview({
  currentMember,
  accountName,
  roles,
  activeMembers,
  calendars,
  canSeeCalendar,
  onOpenCalendar,
}: Props) {
  return (
    <div className="overview-home">
      <div className="overview-greeting">
        <h1 className="overview-greeting-title">God dag, {currentMember.name}.</h1>
        <p className="overview-greeting-sub">
          Familjen {accountName} — alla händelser på ett ställe.
        </p>
      </div>

      {canSeeCalendar && (
        <div className="overview-cal-wrap">
          <div className="overview-cal-toolbar">
            <span className="overview-cal-label">Familjens kalender</span>
            {onOpenCalendar && (
              <button className="week-calendar-link" onClick={onOpenCalendar} type="button">
                Öppna →
              </button>
            )}
          </div>
          <CalendarView
            displayOnly
            calendars={calendars}
            currentMember={currentMember}
            activeMembers={activeMembers}
            roles={roles}
          />
        </div>
      )}
    </div>
  );
}
