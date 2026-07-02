import "./CalendarEventDetail.css";
import { MapPin, Pencil, X } from "lucide-react";
import type { CalendarEvent, Member } from "@shared/types";
import type { EnrichedEvent } from "./CalendarEventList";
import { fmtFullDate, fmtTime } from "./calendarHelpers";
import { useModalA11y } from "../../hooks/useModalA11y";

type CalendarCssVars = React.CSSProperties & {
  "--event-color"?: string;
};

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
  const eventColorStyle: CalendarCssVars = {
    "--event-color": event.color ?? calendarDisplayColor.get(event.calendarId) ?? event.calendarColor,
  };
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className="cal-form-overlay" onClick={onClose}>
      <div
        aria-labelledby="cal-event-detail-title"
        aria-modal="true"
        className="cal-form-modal cal-event-detail-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="cal-form-hdr">
          <span>Händelse</span>
          <button aria-label="Stäng händelse" className="icon-button" onClick={onClose} title="Stäng" type="button">
            <X size={18} />
          </button>
        </div>
        <div className="cal-form-body cal-event-detail-body">
          <div className="cal-event-detail-title-row">
            <div className="cal-event-color-dot" style={eventColorStyle} />
            <h2 className="cal-event-detail-title" id="cal-event-detail-title">{event.title}</h2>
          </div>
          <p className="cal-event-row-meta">
            {event.isAllDay
              ? `${fmtFullDate(event.startsAt.slice(0, 10))} · Heldag`
              : `${fmtFullDate(event.startsAt)} · ${fmtTime(event.startsAt)}–${fmtTime(event.endsAt)}`}
          </p>
          {event.location && (
            <p className="cal-event-row-meta cal-event-detail-location">
              <MapPin className="cal-meta-icon" size={13} /> {event.location}
            </p>
          )}
          {event.notes && (
            <p className="cal-event-detail-notes">
              {event.notes.replace(/\\n/g, "\n")}
            </p>
          )}
          <p className="cal-event-row-meta cal-event-detail-calendar-meta">
            {event.calendarName}{owner && <> · {owner.name}</>}
          </p>
          {canEditEvent(event) && onUpdateEvent && (
            <button
              className="primary-button"
              onClick={() => { onClose(); onEdit(event); }}
              type="button"
            >
              <Pencil size={16} />
              Redigera händelse
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
