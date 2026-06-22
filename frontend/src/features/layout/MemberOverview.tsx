import { CalendarDays } from "lucide-react";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Calendar, CalendarEvent, Member, Role } from "@shared/types";

type WeekItem = {
  event: CalendarEvent;
  creatorName: string;
  participants: Member[];
  isPrivate: boolean;
};

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
  selectedMemberId,
  calendars,
  canSeeCalendar,
  onSelectMember,
  onOpenCalendar
}: Props) {
  const weekEvents = canSeeCalendar ? getWeekEvents(calendars, activeMembers) : [];

  return (
    <div className="overview-home">
      <div className="overview-greeting">
        <h1 className="overview-greeting-title">God dag, {currentMember.name}.</h1>
        <p className="overview-greeting-sub">
          Här är familjen {accountName} i en blick. Klicka på en bild för att öppna någons egen vy.
        </p>
      </div>

      <div className="overview-members">
        {activeMembers.map((member) => {
          const role = roles.find((r) => r.id === member.roleId);
          return (
            <button
              className={`overview-member-btn${selectedMemberId === member.id ? " active" : ""}`}
              key={member.id}
              onClick={() => onSelectMember(member.id)}
              type="button"
            >
              <MemberAvatar member={member} />
              <span className="overview-member-name">{member.name}</span>
              {role && <span className="overview-member-role">{role.name}</span>}
            </button>
          );
        })}
      </div>

      {canSeeCalendar && (
        <div className="week-calendar">
          <header className="week-calendar-header">
            <CalendarDays size={20} />
            <h2>Veckan framåt</h2>
            {onOpenCalendar && (
              <button className="week-calendar-link" onClick={onOpenCalendar} type="button">
                Öppna kalendern →
              </button>
            )}
          </header>

          {weekEvents.length === 0 ? (
            <p className="empty-note">Inga händelser den närmaste veckan.</p>
          ) : (
            <div className="week-calendar-events">
              {weekEvents.map((item) => (
                <div className="week-event-row" key={item.event.id}>
                  <div className="week-event-date">
                    <span className="week-event-day">{fmtDayAbbr(item.event.startsAt)}</span>
                    <span className="week-event-num">{fmtDayNum(item.event.startsAt)}</span>
                    <span className="week-event-month">{fmtMonth(item.event.startsAt)}</span>
                  </div>
                  <div className="week-event-info">
                    <span className="week-event-title">{item.event.title}</span>
                    <span className="week-event-meta">
                      {fmtTime(item.event.startsAt)} · {item.creatorName}
                      {item.isPrivate ? " · privat" : ""}
                    </span>
                  </div>
                  <div className="week-event-participants">
                    {item.participants.map((m) => (
                      <MemberAvatar key={m.id} member={m} size="xs" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getWeekEvents(calendars: Calendar[], members: Member[]): WeekItem[] {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return calendars
    .flatMap((cal) =>
      cal.events
        .filter((ev) => ev.deletedAt === null)
        .filter((ev) => {
          const start = new Date(ev.startsAt);
          return start >= now && start <= weekEnd;
        })
        .map((ev) => {
          const creator = members.find((m) => m.id === ev.createdBy);
          const participants = [
            members.find((m) => m.id === cal.ownerId),
            ...cal.sharedWith.map((s) => members.find((m) => m.id === s.memberId))
          ].filter((m): m is Member => m !== undefined);
          return {
            event: ev,
            creatorName: creator?.name ?? "Okänd",
            participants,
            isPrivate: cal.sharedWith.length === 0
          };
        })
    )
    .sort(
      (a, b) =>
        new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime()
    );
}

const sv = new Intl.DateTimeFormat("sv-SE", { weekday: "short" });
const svDay = new Intl.DateTimeFormat("sv-SE", { day: "numeric" });
const svMonth = new Intl.DateTimeFormat("sv-SE", { month: "long" });
const svTime = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

function fmtDayAbbr(iso: string) {
  return sv.format(new Date(iso)).toUpperCase().replace(".", "");
}
function fmtDayNum(iso: string) {
  return svDay.format(new Date(iso));
}
function fmtMonth(iso: string) {
  return svMonth.format(new Date(iso));
}
function fmtTime(iso: string) {
  return svTime.format(new Date(iso));
}
