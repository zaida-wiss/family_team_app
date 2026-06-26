import "./CalendarEventModal.css";
import { MapPin, RefreshCw, Trash2, X } from "lucide-react";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Calendar, Member } from "@shared/types";
import type { FormState, ModalMode } from "./calendarTypes";
import { RECURRENCE_LABELS, RECURRENCE_UNIT, fmtFullDate, fmtTime } from "./calendarHelpers";
import type { EventRecurrence } from "@shared/types";

type Props = {
  modal: ModalMode;
  isEditing: boolean;
  eventIsEditable: boolean;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editableCalendars: Calendar[];
  otherMembers: Member[];
  onClose: () => void;
  onSubmit: () => void;
  onDelete: () => void;
  onSetField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onToggleAttendee: (memberId: string) => void;
};

export function CalendarEventModal({
  modal, isEditing, eventIsEditable, form, setForm,
  editableCalendars, otherMembers,
  onClose, onSubmit, onDelete, onSetField, onToggleAttendee,
}: Props) {
  return (
    <div className="cal-form-overlay" onClick={onClose}>
      <div className="cal-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-form-hdr">
          <span>{isEditing ? (eventIsEditable ? "Redigera händelse" : "Händelse") : "Ny händelse"}</span>
          <button className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>

        {modal.kind === "edit" && !eventIsEditable ? (
          <div className="cal-form-body">
            <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>{modal.event.title}</p>
            <p className="cal-event-row-meta">
              {modal.event.isAllDay
                ? `${fmtFullDate(modal.event.startsAt.slice(0, 10))} · Heldag`
                : `${fmtFullDate(modal.event.startsAt)} · ${fmtTime(modal.event.startsAt)}–${fmtTime(modal.event.endsAt)}`}
            </p>
            {modal.event.location && <p className="cal-event-row-meta"><MapPin size={13} /> {modal.event.location}</p>}
            {modal.event.notes && (
              <p style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
                {modal.event.notes.replace(/\\n/g, "\n")}
              </p>
            )}
          </div>
        ) : (
          <div className="cal-form-body">
            {editableCalendars.length > 1 && (
              <select className="text-input" onChange={(e) => onSetField("calendarId", e.target.value)} value={form.calendarId}>
                {editableCalendars.map((cal) => <option key={cal.id} value={cal.id}>{cal.name}</option>)}
              </select>
            )}
            <input
              autoFocus
              className="text-input"
              onChange={(e) => onSetField("title", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
              placeholder="Titel"
              value={form.title}
            />
            <label className="cal-allday-row">
              <input
                checked={form.isAllDay}
                onChange={(e) => {
                  const allDay = e.target.checked;
                  setForm((f) => ({
                    ...f,
                    isAllDay: allDay,
                    startsAt: allDay ? f.startsAt.slice(0, 10) : `${f.startsAt.slice(0, 10)}T09:00`,
                    endsAt: allDay ? f.endsAt.slice(0, 10) : `${f.endsAt.slice(0, 10)}T10:00`,
                  }));
                }}
                type="checkbox"
              />
              <span>Heldag</span>
            </label>
            <div className="cal-form-datetimes">
              <div className="cal-form-row">
                <label className="field-label">Startar</label>
                <input className="text-input" onChange={(e) => onSetField("startsAt", e.target.value)} type={form.isAllDay ? "date" : "datetime-local"} value={form.startsAt} />
              </div>
              <div className="cal-form-row">
                <label className="field-label">Slutar</label>
                <input className="text-input" onChange={(e) => onSetField("endsAt", e.target.value)} type={form.isAllDay ? "date" : "datetime-local"} value={form.endsAt} />
              </div>
            </div>
            <div className="cal-form-location">
              <MapPin size={15} />
              <input className="text-input" onChange={(e) => onSetField("location", e.target.value)} placeholder="Plats (valfritt)" value={form.location} />
            </div>
            <textarea className="text-input cal-notes" onChange={(e) => onSetField("notes", e.target.value)} placeholder="Anteckningar (valfritt)" rows={2} value={form.notes} />
            <div className="cal-recurrence">
              <div className="cal-recurrence-top">
                <RefreshCw size={15} />
                <select className="text-input" onChange={(e) => onSetField("recurrenceType", e.target.value as EventRecurrence["type"])} value={form.recurrenceType}>
                  {(Object.keys(RECURRENCE_LABELS) as EventRecurrence["type"][]).map((k) => (
                    <option key={k} value={k}>{RECURRENCE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              {form.recurrenceType !== "none" && (
                <div className="cal-recurrence-details">
                  <label className="field-label">Var</label>
                  <input className="text-input cal-interval-input" min={1} onChange={(e) => onSetField("recurrenceInterval", Math.max(1, Number(e.target.value)))} type="number" value={form.recurrenceInterval} />
                  <span className="cal-interval-unit">{RECURRENCE_UNIT[form.recurrenceType]}</span>
                  <label className="field-label" style={{ marginLeft: 12 }}>Slutar</label>
                  <input className="text-input" onChange={(e) => onSetField("recurrenceUntil", e.target.value)} placeholder="Aldrig" type="date" value={form.recurrenceUntil} />
                </div>
              )}
            </div>
            {otherMembers.length > 0 && (
              <div className="cal-attendees">
                <p className="field-label">Bjud in familjemedlemmar</p>
                <div className="cal-attendee-list">
                  {otherMembers.map((member) => {
                    const checked = form.attendeeIds.includes(member.id);
                    return (
                      <label className={`cal-attendee-item${checked ? " cal-attendee-item--checked" : ""}`} key={member.id}>
                        <input checked={checked} onChange={() => onToggleAttendee(member.id)} style={{ display: "none" }} type="checkbox" />
                        <MemberAvatar member={member} size="small" />
                        <span>{member.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="cal-form-actions">
              {isEditing && (
                <button className="danger-button cal-delete-btn" onClick={onDelete} type="button">
                  <Trash2 size={15} /> Radera
                </button>
              )}
              <button className="primary-button" disabled={!form.title.trim() || !form.startsAt || !form.endsAt} onClick={onSubmit} style={{ flex: 1 }} type="button">
                {isEditing ? "Spara ändringar" : "Spara händelse"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
