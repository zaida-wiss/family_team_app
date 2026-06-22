import { CalendarDays, Download, Plus, Share2, Upload, X } from "lucide-react";
import { useState } from "react";
import {
  canEditSharedResource,
  canExportCalendar,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import type { AccessLevel, Calendar, Id, Member, Role } from "@shared/types";

type ImportedCalendarEvent = {
  title: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
};

type CalendarPanelProps = {
  calendars: Calendar[];
  currentMember: Member;
  members: Member[];
  roles: Role[];
  managementOnly?: boolean;
  onAddEvent: (
    calendarId: Id,
    event: Omit<ImportedCalendarEvent, "notes"> & { notes?: string | null }
  ) => void;
  onCreateCalendar: (name: string) => void;
  onImportCalendar: (
    calendarId: Id,
    sourceName: string,
    events: ImportedCalendarEvent[]
  ) => void;
  onShareCalendar: (calendarId: Id, memberId: Id, access: AccessLevel) => void;
  onRemoveCalendarShare: (calendarId: Id, memberId: Id) => void;
};

export function CalendarPanel({
  calendars,
  currentMember,
  members,
  roles,
  managementOnly = false,
  onAddEvent,
  onCreateCalendar,
  onImportCalendar,
  onRemoveCalendarShare,
  onShareCalendar
}: CalendarPanelProps) {
  const visibleCalendars = calendars.filter((calendar) => {
    if (calendar.deletedAt !== null) {
      return false;
    }

    if (hasPermission(currentMember, roles, "canSeeAllCalendar")) {
      return true;
    }

    return (
      hasPermission(currentMember, roles, "canSeeOwnCalendar") &&
      canViewResource(currentMember, calendar)
    );
  });
  const firstEditableCalendar = visibleCalendars.find((calendar) =>
    canEditCalendar(currentMember, roles, calendar)
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    firstEditableCalendar?.id ?? visibleCalendars[0]?.id ?? ""
  );
  const selectedCalendar =
    visibleCalendars.find((calendar) => calendar.id === selectedCalendarId) ??
    visibleCalendars[0] ??
    null;
  const [calendarName, setCalendarName] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [shareMemberId, setShareMemberId] = useState(
    members.find((member) => member.id !== currentMember.id)?.id ?? ""
  );
  const [shareAccess, setShareAccess] = useState<AccessLevel>("view");

  const canCreateCalendar = hasPermission(currentMember, roles, "canCreateCalendar");
  const canImport = hasPermission(currentMember, roles, "canImportCalendar");
  const canEditSelectedCalendar =
    selectedCalendar !== null &&
    canEditCalendar(currentMember, roles, selectedCalendar);

  function createCalendar() {
    const name = calendarName.trim();

    if (!name || !canCreateCalendar) {
      return;
    }

    onCreateCalendar(name);
    setCalendarName("");
  }

  function addEvent() {
    const title = eventTitle.trim();

    if (!title || !startsAt || !endsAt || !selectedCalendar || !canEditSelectedCalendar) {
      return;
    }

    onAddEvent(selectedCalendar.id, {
      title,
      startsAt,
      endsAt,
      notes: null
    });
    setEventTitle("");
    setStartsAt("");
    setEndsAt("");
  }

  function shareCalendar() {
    if (!selectedCalendar || !shareMemberId || !canEditSelectedCalendar) {
      return;
    }

    onShareCalendar(selectedCalendar.id, shareMemberId, shareAccess);
  }

  async function importCalendar(file: File | null) {
    if (!file || !selectedCalendar || !canImport || !canEditSelectedCalendar) {
      return;
    }

    const text = await file.text();
    const events = parseIcsEvents(text);

    if (events.length === 0) {
      return;
    }

    onImportCalendar(selectedCalendar.id, file.name, events);
  }

  function exportCalendar(calendar: Calendar) {
    if (!canExportCalendar(currentMember, roles, calendar)) {
      return;
    }

    const blob = new Blob([toIcs(calendar)], {
      type: "text/calendar;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${calendar.name}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (visibleCalendars.length === 0 && !canCreateCalendar) {
    return <p className="empty-note">Du har ingen kalender att visa.</p>;
  }

  return (
    <div className="dashboard-list">
      <section className="shopping-create-card" aria-label="Skapa kalender">
        <div>
          <p className="eyebrow">Ny kalender</p>
          <h3>Skapa privat kalender</h3>
        </div>
        <div className="shopping-add-row">
          <input
            className="text-input"
            disabled={!canCreateCalendar}
            onChange={(event) => setCalendarName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                createCalendar();
              }
            }}
            placeholder="Till exempel Min kalender"
            value={calendarName}
          />
          <button
            className="icon-button"
            disabled={!canCreateCalendar}
            onClick={createCalendar}
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {selectedCalendar ? (
        <section className="calendar-tool-card" aria-label="Kalenderverktyg">
          <label>
            Kalender
            <select
              className="text-input"
              onChange={(event) => setSelectedCalendarId(event.target.value)}
              value={selectedCalendar.id}
            >
              {visibleCalendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          </label>

          <div className="calendar-actions">
            <label className="secondary-button">
              <Upload size={16} />
              Importera
              <input
                accept=".ics,text/calendar"
                disabled={!canImport || !canEditSelectedCalendar}
                hidden
                onChange={(event) => {
                  void importCalendar(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <button
              className="secondary-button"
              disabled={!canExportCalendar(currentMember, roles, selectedCalendar)}
              onClick={() => exportCalendar(selectedCalendar)}
              type="button"
            >
              <Download size={16} />
              Exportera
            </button>
          </div>
        </section>
      ) : null}

      {selectedCalendar ? (
        <section className="calendar-tool-card" aria-label="Dela kalender">
          <div>
            <p className="eyebrow">Delning</p>
            <h3>Dela {selectedCalendar.name}</h3>
          </div>

          <div className="calendar-event-form">
            <select
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setShareMemberId(event.target.value)}
              value={shareMemberId}
            >
              <option value="">Välj medlem</option>
              {members
                .filter((member) => member.id !== currentMember.id)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
            <select
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setShareAccess(event.target.value as AccessLevel)}
              value={shareAccess}
            >
              <option value="view">Bara se</option>
              <option value="edit">Redigera</option>
            </select>
            <button
              className="secondary-button"
              disabled={!canEditSelectedCalendar || !shareMemberId}
              onClick={shareCalendar}
              type="button"
            >
              <Share2 size={16} />
              Dela
            </button>
          </div>

          {selectedCalendar.sharedWith.length > 0 ? (
            <div className="share-list">
              {selectedCalendar.sharedWith.map((share) => (
                <div className="share-row" key={share.memberId}>
                  <span>
                    {getMemberName(share.memberId, members)}
                    <small>{share.access === "edit" ? "Kan redigera" : "Kan se"}</small>
                  </span>
                  <button
                    className="icon-button danger"
                    disabled={!canEditSelectedCalendar}
                    onClick={() =>
                      onRemoveCalendarShare(selectedCalendar.id, share.memberId)
                    }
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">Kalendern är privat.</p>
          )}
        </section>
      ) : null}

      {!managementOnly && selectedCalendar ? (
        <section className="calendar-tool-card" aria-label="Lägg till kalenderhändelse">
          <div className="calendar-event-form">
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setEventTitle(event.target.value)}
              placeholder="Händelse"
              value={eventTitle}
            />
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setStartsAt(event.target.value)}
              type="datetime-local"
              value={startsAt}
            />
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setEndsAt(event.target.value)}
              type="datetime-local"
              value={endsAt}
            />
            <button
              className="icon-button"
              disabled={!canEditSelectedCalendar}
              onClick={addEvent}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
        </section>
      ) : null}

      {!managementOnly && visibleCalendars.flatMap((calendar) =>
        calendar.events
          .filter((event) => event.deletedAt === null)
          .map((event) => (
            <div className="dashboard-row" key={event.id}>
              <CalendarDays size={18} />
              <span>
                {event.title}
                <small>{calendar.name}</small>
              </span>
              <strong>{formatTimeRange(event.startsAt, event.endsAt)}</strong>
            </div>
          ))
      )}
    </div>
  );
}

function canEditCalendar(member: Member, roles: Role[], calendar: Calendar) {
  return (
    hasPermission(member, roles, "canEditCalendar") &&
    canEditSharedResource(member, calendar)
  );
}

function getMemberName(memberId: Id, members: Member[]) {
  return members.find((member) => member.id === memberId)?.name ?? "Okänd medlem";
}

function parseIcsEvents(text: string): ImportedCalendarEvent[] {
  return text
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => block.split("END:VEVENT")[0] ?? "")
    .map((block) => {
      const title = getIcsValue(block, "SUMMARY") ?? "Importerad händelse";
      const startsAt = parseIcsDate(getIcsValue(block, "DTSTART"));
      const endsAt = parseIcsDate(getIcsValue(block, "DTEND"));

      if (!startsAt || !endsAt) {
        return null;
      }

      return {
        title,
        startsAt,
        endsAt,
        notes: getIcsValue(block, "DESCRIPTION")
      };
    })
    .filter((event): event is ImportedCalendarEvent => event !== null);
}

function getIcsValue(block: string, key: string) {
  const line = block
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${key}:`) || candidate.startsWith(`${key};`));

  return line?.slice(line.indexOf(":") + 1).trim() ?? null;
}

function parseIcsDate(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  }

  if (/^\d{8}T\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
  }

  return null;
}

function toIcs(calendar: Calendar) {
  const events = calendar.events
    .filter((event) => event.deletedAt === null)
    .map((event) => {
      return [
        "BEGIN:VEVENT",
        `UID:${event.id}`,
        `SUMMARY:${escapeIcs(event.title)}`,
        `DTSTART:${formatIcsDate(event.startsAt)}`,
        `DTEND:${formatIcsDate(event.endsAt)}`,
        event.notes ? `DESCRIPTION:${escapeIcs(event.notes)}` : null,
        "END:VEVENT"
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Team App//SV",
    `X-WR-CALNAME:${escapeIcs(calendar.name)}`,
    events,
    "END:VCALENDAR"
  ].join("\r\n");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
}
