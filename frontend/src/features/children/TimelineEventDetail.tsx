import { MapPin, X } from "lucide-react";
import type { EnrichedEvent } from "../calendars/CalendarEventList";
import { fmtDayLabel, fmtDaysFromToday, fmtEventTime } from "./timelineMath";
import { useModalA11y } from "../../hooks/useModalA11y";
import { useLinkifiedText } from "../../hooks/useLinkifiedText";
import { LocationLink } from "../../components/LocationLink";

type Props = {
  event: EnrichedEvent;
  onClose: () => void;
};

export function TimelineEventDetail({ event, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const notesContent = useLinkifiedText(event.notes ? event.notes.replace(/\\n/g, "\n") : null);
  return (
    <div
      className="child-tl-detail-backdrop"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="child-tl-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`Information om ${event.title}`}
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
      >
        <button
          className="child-tl-detail-close"
          type="button"
          aria-label="Stäng händelseinformation"
          onClick={onClose}
        >
          <X size={14} />
        </button>
        {event.displaySymbol && (
          <div className="child-tl-detail-symbol">{event.displaySymbol}</div>
        )}
        <h3>{event.title}</h3>
        <p className="child-tl-detail-time">
          {fmtDayLabel(event.startsAt)} · {fmtEventTime(event)}
        </p>
        <p className="child-tl-detail-distance">{fmtDaysFromToday(event.startsAt)}</p>
        <p className="child-tl-detail-calendar">{event.calendarName}</p>
        {event.location && (
          <p className="child-tl-detail-location">
            <MapPin size={13} />
            <LocationLink location={event.location} />
          </p>
        )}
        {notesContent && (
          <p className="child-tl-detail-notes">{notesContent}</p>
        )}
      </div>
    </div>
  );
}
