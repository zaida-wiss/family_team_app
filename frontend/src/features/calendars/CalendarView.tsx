import { ChevronLeft, ChevronRight, MapPin, Plus, RefreshCw, Repeat, Trash2, X } from "lucide-react";
import { Fragment } from "react";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Calendar, CalendarEvent, CalendarSettings, Id, Member, Role } from "@shared/types";
import "./CalendarView.css";
import { CalendarEventList } from "./CalendarEventList";
import type { EnrichedEvent } from "./CalendarEventList";
import { DAYS, MONTHS, RECURRENCE_LABELS, RECURRENCE_UNIT, fmtFullDate, fmtTime, getISOWeek, isHolidayEvent, toLocalDateStr } from "./calendarHelpers";
import { useCalendarView } from "./useCalendarView";

// ── Types ────────────────────────────────────────────────────────────────────

type Props = {
  calendars: Calendar[];
  currentMember: Member;
  activeMembers: Member[];
  roles: Role[];
  displayOnly?: boolean;
  calendarSettings?: CalendarSettings;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onRsvpEvent?: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
};

export type FormState = {
  calendarId: string;
  title: string;
  isAllDay: boolean;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  recurrenceType: import("@shared/types").EventRecurrence["type"];
  recurrenceInterval: number;
  recurrenceUntil: string;
  attendeeIds: string[];
};

export type ModalMode = { kind: "new"; prefilledDate?: string } | { kind: "edit"; event: EnrichedEvent };

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarView({ calendars, currentMember, activeMembers, roles, displayOnly = false, calendarSettings, onAddEvent, onUpdateEvent, onDeleteEvent, onRsvpEvent }: Props) {
  const {
    todayStr, viewYear, viewMonth, selectedDay, setSelectedDay,
    modal, form, setForm, detailEvent, setDetailEvent, longPressRef,
    visible, editableCalendars, canEditEvent, pendingInvitations,
    eventsForDay, listEvents, prevMonth, nextMonth,
    openNew, openEdit, closeModal, submitForm, deleteEvent,
    setField, toggleAttendee, weeks,
    showWeekNumbers, showHolidays, holidayBgColor, holidayTextColor,
    calendarDisplayColor, isEditing, eventIsEditable, otherMembers,
  } = useCalendarView(calendars, currentMember, activeMembers, roles, calendarSettings, onAddEvent, onUpdateEvent, onDeleteEvent);

  if (visible.length === 0 && !displayOnly) {
    return (
      <article className="dashboard">
        <header className="section-header">
          <div><p className="eyebrow">Kalender</p><h2>Inga kalendrar</h2></div>
        </header>
        <p className="empty-note">Du har inga tillgängliga kalendrar. Skapa en i Inställningar.</p>
      </article>
    );
  }

  // ── Shared modal (used in both displayOnly and full view) ──
  const eventModalOverlay = modal ? (
    <div className="cal-form-overlay" onClick={closeModal}>
      <div className="cal-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-form-hdr">
          <span>{isEditing ? (eventIsEditable ? "Redigera händelse" : "Händelse") : "Ny händelse"}</span>
          <button className="icon-button" onClick={closeModal} type="button"><X size={18} /></button>
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
              <select className="text-input" onChange={(e) => setField("calendarId", e.target.value)} value={form.calendarId}>
                {editableCalendars.map((cal) => <option key={cal.id} value={cal.id}>{cal.name}</option>)}
              </select>
            )}
            <input
              autoFocus
              className="text-input"
              onChange={(e) => setField("title", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitForm(); }}
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
                <input className="text-input" onChange={(e) => setField("startsAt", e.target.value)} type={form.isAllDay ? "date" : "datetime-local"} value={form.startsAt} />
              </div>
              <div className="cal-form-row">
                <label className="field-label">Slutar</label>
                <input className="text-input" onChange={(e) => setField("endsAt", e.target.value)} type={form.isAllDay ? "date" : "datetime-local"} value={form.endsAt} />
              </div>
            </div>
            <div className="cal-form-location">
              <MapPin size={15} />
              <input className="text-input" onChange={(e) => setField("location", e.target.value)} placeholder="Plats (valfritt)" value={form.location} />
            </div>
            <textarea className="text-input cal-notes" onChange={(e) => setField("notes", e.target.value)} placeholder="Anteckningar (valfritt)" rows={2} value={form.notes} />
            <div className="cal-recurrence">
              <div className="cal-recurrence-top">
                <RefreshCw size={15} />
                <select className="text-input" onChange={(e) => setField("recurrenceType", e.target.value as import("@shared/types").EventRecurrence["type"])} value={form.recurrenceType}>
                  {(Object.keys(RECURRENCE_LABELS) as import("@shared/types").EventRecurrence["type"][]).map((k) => (
                    <option key={k} value={k}>{RECURRENCE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              {form.recurrenceType !== "none" && (
                <div className="cal-recurrence-details">
                  <label className="field-label">Var</label>
                  <input className="text-input cal-interval-input" min={1} onChange={(e) => setField("recurrenceInterval", Math.max(1, Number(e.target.value)))} type="number" value={form.recurrenceInterval} />
                  <span className="cal-interval-unit">{RECURRENCE_UNIT[form.recurrenceType]}</span>
                  <label className="field-label" style={{ marginLeft: 12 }}>Slutar</label>
                  <input className="text-input" onChange={(e) => setField("recurrenceUntil", e.target.value)} placeholder="Aldrig" type="date" value={form.recurrenceUntil} />
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
                        <input checked={checked} onChange={() => toggleAttendee(member.id)} style={{ display: "none" }} type="checkbox" />
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
                <button className="danger-button cal-delete-btn" onClick={deleteEvent} type="button">
                  <Trash2 size={15} /> Radera
                </button>
              )}
              <button className="primary-button" disabled={!form.title.trim() || !form.startsAt || !form.endsAt} onClick={submitForm} style={{ flex: 1 }} type="button">
                {isEditing ? "Spara ändringar" : "Spara händelse"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (displayOnly) {
    const handleDayTouchStart = (dateStr: string) => {
      if (editableCalendars.length === 0 || !onAddEvent) return;
      longPressRef.current = setTimeout(() => { openNew(dateStr); }, 600);
    };
    const handleDayTouchEnd = () => {
      if (longPressRef.current !== null) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    };

    return (
      <div className="cal-overview-wrap">

        <div className="cal-grid-card">
          <div className="cal-grid-nav">
            <button className="icon-button" onClick={prevMonth} type="button"><ChevronLeft size={18} /></button>
            <span className="cal-grid-month">{MONTHS[viewMonth]} {viewYear}</span>
            <button className="icon-button" onClick={nextMonth} type="button"><ChevronRight size={18} /></button>
          </div>
          <div className={`cal-day-names${showWeekNumbers ? " cal-day-names--wk" : ""}`}>
            {showWeekNumbers && <span className="cal-wk-label" />}
            {DAYS.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className={`cal-grid${showWeekNumbers ? " cal-grid--wk" : ""}`}>
            {weeks.map((week) => (
              <Fragment key={week[0].date.getTime()}>
                {showWeekNumbers && (
                  <span className="cal-wk-num">
                    v.{getISOWeek(week[0].date)}
                  </span>
                )}
                {week.map(({ date, isCurrentMonth }) => {
                  const dateStr = toLocalDateStr(date);
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDay;
                  const dayEvents = isCurrentMonth
                    ? eventsForDay(dateStr).filter((ev) => showHolidays || !isHolidayEvent(ev))
                    : [];
                  return (
                    <div
                      key={dateStr}
                      className={["cal-cell", !isCurrentMonth && "cal-cell--other", isToday && "cal-cell--today", isSelected && "cal-cell--selected"].filter(Boolean).join(" ")}
                      onClick={() => { if (isCurrentMonth) setSelectedDay((s) => s === dateStr ? null : dateStr); }}
                      onTouchCancel={handleDayTouchEnd}
                      onTouchEnd={handleDayTouchEnd}
                      onTouchStart={() => { if (isCurrentMonth) handleDayTouchStart(dateStr); }}
                    >
                      <span className="cal-cell-num">{date.getDate()}</span>
                      <div className="cal-cell-dots">
                        {dayEvents.slice(0, 5).map((ev) => {
                          const holiday = isHolidayEvent(ev);
                          return (
                            <span
                              key={ev.id}
                              className="cal-cell-dot"
                              style={{ background: holiday ? holidayBgColor : (calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor) }}
                              title={ev.title}
                            />
                          );
                        })}
                        {dayEvents.length > 5 && <span className="cal-cell-dot-more">+{dayEvents.length - 5}</span>}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        <CalendarEventList
          key={`${viewYear}-${viewMonth}`}
          allEvents={listEvents}
          selectedDay={selectedDay}
          viewYear={viewYear}
          viewMonth={viewMonth}
          todayStr={todayStr}
          visible={visible}
          calendarDisplayColor={calendarDisplayColor}
          showHolidays={showHolidays}
          holidayBgColor={holidayBgColor}
          holidayTextColor={holidayTextColor}
          onEventClick={setDetailEvent}
          onClearDay={() => setSelectedDay(null)}
          onNewEvent={editableCalendars.length > 0 && onAddEvent ? () => openNew() : undefined}
        />

        {/* Event detail panel */}
        {detailEvent && (
          <div className="cal-form-overlay" onClick={() => setDetailEvent(null)}>
            <div className="cal-form-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cal-form-hdr">
                <span>Händelse</span>
                <button className="icon-button" onClick={() => setDetailEvent(null)} type="button"><X size={18} /></button>
              </div>
              <div className="cal-form-body">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div className="cal-event-color-dot" style={{ background: detailEvent.color ?? calendarDisplayColor.get(detailEvent.calendarId) ?? detailEvent.calendarColor }} />
                  <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>{detailEvent.title}</p>
                </div>
                <p className="cal-event-row-meta">
                  {detailEvent.isAllDay
                    ? `${fmtFullDate(detailEvent.startsAt.slice(0, 10))} · Heldag`
                    : `${fmtFullDate(detailEvent.startsAt)} · ${fmtTime(detailEvent.startsAt)}–${fmtTime(detailEvent.endsAt)}`}
                </p>
                {detailEvent.location && (
                  <p className="cal-event-row-meta" style={{ marginTop: 4 }}>
                    <MapPin size={13} style={{ verticalAlign: "middle" }} /> {detailEvent.location}
                  </p>
                )}
                {detailEvent.notes && (
                  <p style={{ fontSize: "0.875rem", marginTop: 8, whiteSpace: "pre-wrap" }}>
                    {detailEvent.notes.replace(/\\n/g, "\n")}
                  </p>
                )}
                <p className="cal-event-row-meta" style={{ marginTop: 8 }}>
                  {detailEvent.calendarName}
                  {activeMembers.find((m) => m.id === detailEvent.calendarOwnerId) && (
                    <> · {activeMembers.find((m) => m.id === detailEvent.calendarOwnerId)!.name}</>
                  )}
                </p>
                {canEditEvent(detailEvent) && onUpdateEvent && (
                  <button
                    className="primary-button"
                    onClick={() => { setDetailEvent(null); openEdit(detailEvent); }}
                    style={{ marginTop: 12, width: "100%" }}
                    type="button"
                  >
                    Redigera händelse
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {eventModalOverlay}
      </div>
    );
  }

  return (
    <div className="cal-view">
      {/* ── Header ── */}
      <div className="cal-view-top">
        <div>
          <h2 className="cal-view-title">Kalender</h2>
          <p className="cal-view-sub">Privata och delade händelser, allt på en plats.</p>
        </div>
        {editableCalendars.length > 0 && (
          <button className="primary-button cal-new-btn" onClick={() => openNew()} type="button">
            <Plus size={16} />
            Ny händelse
          </button>
        )}
      </div>

      {/* ── Pending invitations ── */}
      {pendingInvitations.length > 0 && (
        <div className="cal-invitations">
          <p className="cal-invitations-title">Inbjudningar ({pendingInvitations.length})</p>
          {pendingInvitations.map((ev) => (
            <div className="cal-invitation-row" key={ev.id}>
              <div className="cal-event-color-dot" style={{ background: ev.color ?? ev.calendarColor }} />
              <div className="cal-event-row-info">
                <span className="cal-event-row-title">{ev.title}</span>
                <span className="cal-event-row-meta">
                  {ev.isAllDay ? fmtFullDate(ev.startsAt.slice(0, 10)) : `${fmtFullDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}`}
                  {ev.location && ` · ${ev.location}`}
                </span>
              </div>
              <div className="cal-rsvp-btns">
                <button className="secondary-button" onClick={() => onRsvpEvent?.(ev.calendarId, ev.id, "declined")} type="button">Tacka nej</button>
                <button className="primary-button" onClick={() => onRsvpEvent?.(ev.calendarId, ev.id, "accepted")} type="button">Acceptera</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Monthly grid ── */}
      <div className="cal-grid-card">
        <div className="cal-grid-nav">
          <button className="icon-button" onClick={prevMonth} type="button"><ChevronLeft size={18} /></button>
          <span className="cal-grid-month">{MONTHS[viewMonth]} {viewYear}</span>
          <button className="icon-button" onClick={nextMonth} type="button"><ChevronRight size={18} /></button>
        </div>
        <div className={`cal-day-names${showWeekNumbers ? " cal-day-names--wk" : ""}`}>
          {showWeekNumbers && <span className="cal-wk-label" />}
          {DAYS.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className={`cal-grid${showWeekNumbers ? " cal-grid--wk" : ""}`}>
          {weeks.map((week) => (
            <Fragment key={week[0].date.getTime()}>
              {showWeekNumbers && (
                <span className="cal-wk-num">
                  v.{getISOWeek(week[0].date)}
                </span>
              )}
              {week.map(({ date, isCurrentMonth }) => {
                const dateStr = toLocalDateStr(date);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDay;
                const dayEvents = isCurrentMonth
                  ? eventsForDay(dateStr).filter((ev) => showHolidays || !isHolidayEvent(ev))
                  : [];

                return (
                  <div
                    key={dateStr}
                    className={["cal-cell", !isCurrentMonth && "cal-cell--other", isToday && "cal-cell--today", isSelected && "cal-cell--selected"].filter(Boolean).join(" ")}
                    onClick={() => { if (isCurrentMonth) setSelectedDay((s) => s === dateStr ? null : dateStr); }}
                  >
                    <span className="cal-cell-num">{date.getDate()}</span>
                    <div className="cal-cell-events">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const holiday = isHolidayEvent(ev);
                        return (
                          <div
                            key={ev.id}
                            className="cal-event-pill"
                            style={holiday
                              ? { "--event-color": holidayBgColor, color: holidayTextColor } as React.CSSProperties
                              : { "--event-color": ev.calendarColor } as React.CSSProperties}
                            title={ev.title}
                            onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                          >
                            {!ev.isAllDay && `${fmtTime(ev.startsAt)} `}{ev.title}
                            {ev.recurrence?.type !== "none" && <Repeat size={8} style={{ marginLeft: 2, opacity: 0.7 }} />}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <span className="cal-event-more">+{dayEvents.length - 3}</span>}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Event list ── */}
      <CalendarEventList
        key={`${viewYear}-${viewMonth}`}
        allEvents={listEvents}
        selectedDay={selectedDay}
        viewYear={viewYear}
        viewMonth={viewMonth}
        todayStr={todayStr}
        visible={visible}
        calendarDisplayColor={calendarDisplayColor}
        showHolidays={showHolidays}
        holidayBgColor={holidayBgColor}
        holidayTextColor={holidayTextColor}
        onEventClick={openEdit}
        onClearDay={() => setSelectedDay(null)}
        onNewEvent={editableCalendars.length > 0 ? () => openNew() : undefined}
      />

      {eventModalOverlay}
    </div>
  );
}
