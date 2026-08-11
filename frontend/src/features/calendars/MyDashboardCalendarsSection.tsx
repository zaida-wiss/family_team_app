import type { Calendar, Id, Member } from "@shared/types";
import { getMemberName } from "./calendarPanelHelpers";

type Props = {
  calendars: Calendar[];
  members: Member[];
  currentMember: Member;
  onSetDashboardVisibility: (calendarId: Id, memberId: Id) => void;
  onRemoveDashboardVisibility: (calendarId: Id, memberId: Id) => void;
};

// Självbetjäning för vuxna (2026-08-11, uppföljning av Zaidas
// Familjekonto-diskussion, se docs/.../2026-08-11-installningar-familjekonto-
// omorganisation.md): dashboardVisibleTo styrdes tidigare bara av en admin,
// och bara för barn (MemberEditModal.tsx). Bland kalendrar NÅGON ANNAN redan
// delat med mig (sharedWith), väljer jag SJÄLV vilka som ska synas på min
// EGEN dashboard — helt oberoende av att kalendern redan är delad till
// familjekalendern. Nollställt som standard: ingen kryssruta förikryssad
// förrän jag själv aktivt väljer.
export function MyDashboardCalendarsSection({
  calendars,
  members,
  currentMember,
  onSetDashboardVisibility,
  onRemoveDashboardVisibility,
}: Props) {
  const sharedWithMe = calendars.filter(
    (cal) =>
      cal.deletedAt === null &&
      !cal.readOnly &&
      cal.ownerId !== currentMember.id &&
      cal.sharedWith.some((s) => s.memberId === currentMember.id)
  );

  return (
    <section aria-label="Min dashboard">
      <div>
        <p className="eyebrow">Dashboard</p>
        <h3>Min dashboard</h3>
      </div>
      <p className="empty-note">
        Kalendrar andra delat med dig syns i familjekalendern. Kryssa i vilka som ska visas på din
        egen dashboard också.
      </p>
      {sharedWithMe.length > 0 ? (
        <div className="share-list">
          {sharedWithMe.map((cal) => (
            <label className="cal-filter-item" key={cal.id}>
              <input
                checked={(cal.dashboardVisibleTo ?? []).includes(currentMember.id)}
                onChange={(e) => {
                  if (e.target.checked) onSetDashboardVisibility(cal.id, currentMember.id);
                  else onRemoveDashboardVisibility(cal.id, currentMember.id);
                }}
                type="checkbox"
              />
              <span className="cal-filter-dot" style={{ background: cal.color }} />
              <span>
                {cal.name} <small>({getMemberName(cal.ownerId, members)})</small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="empty-note">Ingen har delat en kalender med dig än.</p>
      )}
    </section>
  );
}
