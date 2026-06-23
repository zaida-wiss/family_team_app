import { MapPin, X } from "lucide-react";
import type { CalendarEvent, Member } from "@shared/types";
import type { EnrichedEvent } from "./CalendarEventList";
import { fmtFullDate, fmtTime } from "./calendarHelpers";

type Props = {
  event: EnrichedEvent;
  calendarDisplayColor: Map<string, string>;
  activeMembers: Member[];
  canEditEvent: (ev: EnrichedEvent) => boolean;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onClose: () => void;
  onEdit: (ev: EnrichedEvent) => void;
};

export function CalendarEventDetail({
  event, calendarDisplayColor, activeMembers,
  canEditEvent, onUpdateEvent, onClose, onEdit,
}: Props) {
  const owner = activeMembers.find((m) => m.id === event.calendarOwnerId);

  return (
    <div className="cal-form-overlay" onClick={onClose}>
      <div className="cal-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-form-hdr">
          <span>Händelse</span>
          <button className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="cal-form-body">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div className="cal-event-color-dot" style={{ background: event.color ?? calendarDisplayColor.get(event.calendarId) ?? event.calendarColor }} />
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>{event.title}</p>
          </div>
          <p className="cal-event-row-meta">
            {event.isAllDay
              ? `${fmtFullDate(event.startsAt.slice(0, 10))} · Heldag`
              : `${fmtFullDate(event.startsAt)} · ${fmtTime(event.startsAt)}–${fmtTime(event.endsAt)}`}
          </p>
          {event.location && (
            <p className="cal-event-row-meta" style={{ marginTop: 4 }}>
              <MapPin size={13} style={{ verticalAlign: "middle" }} /> {event.location}
            </p>
          )}
          {event.notes && (
            <p style={{ fontSize: "0.875rem", marginTop: 8, whiteSpace: "pre-wrap" }}>
              {event.notes.replace(/\\n/g, "\n")}
            </p>
          )}
          <p className="cal-event-row-meta" style={{ marginTop: 8 }}>
            {event.calendarName}{owner && <> · {owner.name}</>}
          </p>
          {canEditEvent(event) && onUpdateEvent && (
            <button
              className="primary-button"
              onClick={() => { onClose(); onEdit(event); }}
              style={{ marginTop: 12, width: "100%" }}
              type="button"
            >
              Redigera händelse
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
