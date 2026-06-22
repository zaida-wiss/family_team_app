import { CalendarDays, Plus } from "lucide-react";
import { useState } from "react";
import { canEditSharedResource, canViewResource, hasPermission } from "../../utils/permissions";
import type { Calendar, Id, Member, Role } from "@shared/types";

type Props = {
  calendars: Calendar[];
  currentMember: Member;
  roles: Role[];
  onAddEvent: (
    calendarId: Id,
    event: { title: string; startsAt: string; endsAt: string; notes: string | null }
  ) => void;
};

export function CalendarView({ calendars, currentMember, roles, onAddEvent }: Props) {
  const visible = calendars.filter((cal) => {
    if (cal.deletedAt !== null) return false;
    if (hasPermission(currentMember, roles, "canSeeAllCalendar")) return true;
    return (
      hasPermission(currentMember, roles, "canSeeOwnCalendar") &&
      canViewResource(currentMember, cal)
    );
  });

  const editableCalendars = visible.filter(
    (cal) =>
      hasPermission(currentMember, roles, "canEditCalendar") &&
      canEditSharedResource(currentMember, cal)
  );

  const [selectedId, setSelectedId] = useState(editableCalendars[0]?.id ?? visible[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const allEvents = visible
    .flatMap((cal) =>
      cal.events
        .filter((ev) => ev.deletedAt === null)
        .map((ev) => ({ ...ev, calendarName: cal.name, calendarColor: cal.color }))
    )
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const upcoming = allEvents.filter((ev) => new Date(ev.endsAt) >= new Date());
  const past = allEvents.filter((ev) => new Date(ev.endsAt) < new Date());

  function addEvent() {
    const trimmed = title.trim();
    if (!trimmed || !startsAt || !endsAt || !selectedId) return;
    const canEdit = editableCalendars.some((cal) => cal.id === selectedId);
    if (!canEdit) return;
    onAddEvent(selectedId, { title: trimmed, startsAt, endsAt, notes: null });
    setTitle("");
    setStartsAt("");
    setEndsAt("");
  }

  if (visible.length === 0) {
    return (
      <article className="dashboard">
        <header className="section-header">
          <div><p className="eyebrow">Kalender</p><h2>Inga kalendrar</h2></div>
        </header>
        <p className="empty-note">Du har inga tillgängliga kalendrar. Skapa en i Inställningar.</p>
      </article>
    );
  }

  return (
    <article className="dashboard">
      <header className="section-header">
        <div>
          <p className="eyebrow">Kalender</p>
          <h2>Händelser</h2>
        </div>
        <CalendarDays size={22} />
      </header>

      {editableCalendars.length > 0 && (
        <div className="cal-add-event">
          {editableCalendars.length > 1 && (
            <select
              className="text-input"
              onChange={(e) => setSelectedId(e.target.value)}
              value={selectedId}
            >
              {editableCalendars.map((cal) => (
                <option key={cal.id} value={cal.id}>{cal.name}</option>
              ))}
            </select>
          )}
          <div className="cal-add-row">
            <input
              className="text-input"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addEvent(); }}
              placeholder="Händelse"
              value={title}
            />
            <input className="text-input" onChange={(e) => setStartsAt(e.target.value)} type="datetime-local" value={startsAt} />
            <input className="text-input" onChange={(e) => setEndsAt(e.target.value)} type="datetime-local" value={endsAt} />
            <button className="icon-button" disabled={!title.trim() || !startsAt || !endsAt} onClick={addEvent} type="button">
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <p className="empty-note">Inga händelser inlagda.</p>
      )}

      {upcoming.length > 0 && (
        <div className="cal-event-group">
          <p className="eyebrow" style={{ padding: "0 0 8px" }}>Kommande</p>
          {upcoming.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="cal-event-group">
          <p className="eyebrow" style={{ padding: "16px 0 8px", opacity: 0.6 }}>Tidigare</p>
          {past.map((ev) => (
            <EventRow key={ev.id} event={ev} dimmed />
          ))}
        </div>
      )}
    </article>
  );
}

function EventRow({
  event,
  dimmed = false
}: {
  event: { id: string; title: string; startsAt: string; endsAt: string; calendarName: string };
  dimmed?: boolean;
}) {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
  return (
    <div className="dashboard-row" style={{ opacity: dimmed ? 0.5 : 1 }}>
      <CalendarDays size={16} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{event.title}</span>
        <small style={{ color: "#6b8f85" }}>{event.calendarName}</small>
      </div>
      <strong style={{ fontSize: "0.82rem", color: "#4a706a", flexShrink: 0 }}>
        {fmt.format(new Date(event.startsAt))}
      </strong>
    </div>
  );
}
