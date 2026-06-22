import { CalendarDays } from "lucide-react";
import { MemberAvatar } from "../../components/MemberAvatar";
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
  selectedMemberId,
  calendars,
  canSeeCalendar,
  onSelectMember,
  onOpenCalendar,
}: Props) {
  const weekDays = canSeeCalendar ? getWeekDays(calendars) : [];
  const todayStr = toLocalDateStr(new Date());

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

          <div className="week-timeline">
            {weekDays.map(({ date, dateStr, memberEvents }) => {
              const isToday = dateStr === todayStr;

              return (
                <div className="week-tl-day" key={dateStr}>
                  <div className="week-tl-day-hdr">
                    <span className="week-tl-abbr">{fmtAbbr(date)}</span>
                    <span className={`week-tl-num${isToday ? " week-tl-num--today" : ""}`}>
                      {date.getDate()}
                    </span>
                  </div>

                  <div className="week-tl-rows">
                    {activeMembers.map((member) => {
                      const color = getMemberColor(member.id, calendars);
                      const events = (memberEvents.get(member.id) ?? []).sort(
                        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
                      );

                      return (
                        <div className="week-tl-row" key={member.id}>
                          <MemberAvatar member={member} size="xs" />
                          <div className="week-tl-bar">
                            {events.map((ev) => (
                              <div
                                className="week-tl-dot"
                                key={ev.id}
                                style={{
                                  left: `${timeToPercent(ev.startsAt)}%`,
                                  background: color,
                                }}
                                title={`${fmtTime(ev.startsAt)} ${ev.title}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {weekDays.length === 0 && (
              <p className="empty-note" style={{ padding: "14px 20px" }}>
                Inga händelser den närmaste veckan.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function toLocalDateStr(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function timeToPercent(isoStr: string): number {
  const d = new Date(isoStr);
  return ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
}

function getMemberColor(memberId: string, calendars: Calendar[]): string {
  const cal = calendars.find((c) => c.ownerId === memberId && c.deletedAt === null);
  return cal?.color ?? "var(--muted-fg)";
}

function getWeekDays(calendars: Calendar[]) {
  const now = new Date();

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dateStr = toLocalDateStr(date);

    const memberEvents = new Map<string, { id: string; title: string; startsAt: string }[]>();

    for (const cal of calendars) {
      if (cal.deletedAt !== null) continue;
      const dayEvents = cal.events
        .filter(
          (ev) => ev.deletedAt === null && toLocalDateStr(new Date(ev.startsAt)) === dateStr
        )
        .map((ev) => ({ id: ev.id, title: ev.title, startsAt: ev.startsAt }));

      if (dayEvents.length > 0) {
        const existing = memberEvents.get(cal.ownerId) ?? [];
        memberEvents.set(cal.ownerId, [...existing, ...dayEvents]);
      }
    }

    return { date, dateStr, memberEvents };
  });
}

const svAbbr = new Intl.DateTimeFormat("sv-SE", { weekday: "short" });
const svTime = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

function fmtAbbr(date: Date) {
  return svAbbr.format(date).replace(".", "").toUpperCase();
}
function fmtTime(iso: string) {
  return svTime.format(new Date(iso));
}
