import { CalendarDays, ChevronRight } from "lucide-react";
import { MemberAvatar } from "../members/MemberAvatar";
import type { Calendar, Member } from "@shared/types";

type Props = {
  activeMembers: Member[];
  selectedMemberId: string;
  calendars: Calendar[];
  canSeeCalendar: boolean;
  onSelectMember: (memberId: string) => void;
};

export function MemberOverview({
  activeMembers,
  selectedMemberId,
  calendars,
  canSeeCalendar,
  onSelectMember
}: Props) {
  const nextCalendarEvent = canSeeCalendar
    ? calendars
        .flatMap((cal) =>
          cal.events
            .filter((ev) => ev.deletedAt === null)
            .map((ev) => ({ cal, ev }))
        )
        .sort(
          (a, b) =>
            new Date(a.ev.startsAt).getTime() - new Date(b.ev.startsAt).getTime()
        )[0]
    : undefined;

  return (
    <section className="overview-grid">
      {canSeeCalendar && (
        <article className="calendar-panel">
          <header className="section-header">
            <div>
              <p className="eyebrow">Översikt</p>
              <h2>Kalender</h2>
            </div>
            <CalendarDays size={24} />
          </header>

          {nextCalendarEvent ? (
            <div className="calendar-card">
              <span className="date-chip">
                {formatDateChip(nextCalendarEvent.ev.startsAt)}
              </span>
              <div>
                <h3>{nextCalendarEvent.ev.title}</h3>
                <p>
                  {formatTimeRange(
                    nextCalendarEvent.ev.startsAt,
                    nextCalendarEvent.ev.endsAt
                  )}{" "}
                  i {nextCalendarEvent.cal.name}
                </p>
              </div>
            </div>
          ) : (
            <p className="empty-note">Ingen kalenderhändelse inlagd.</p>
          )}
        </article>
      )}

      <article className="members-panel">
        <header className="section-header">
          <div>
            <p className="eyebrow">Medlemmar</p>
            <h2>Personliga dashboards</h2>
          </div>
          <ChevronRight size={24} />
        </header>

        <div className="member-row">
          {activeMembers.map((member) => (
            <button
              className={`member-button ${selectedMemberId === member.id ? "active" : ""}`}
              key={member.id}
              onClick={() => onSelectMember(member.id)}
              type="button"
            >
              <MemberAvatar member={member} showArchedName />
              <span className="member-name-fallback">{member.name}</span>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const fmt = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });
  return `${fmt.format(new Date(startsAt))}–${fmt.format(new Date(endsAt))}`;
}

function formatDateChip(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(
    new Date(value)
  );
}
