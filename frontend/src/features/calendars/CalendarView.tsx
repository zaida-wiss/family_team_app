import { useState } from "react";
import type { Calendar, CalendarEvent, CalendarSettings, Id, Member, Role } from "@shared/types";
import "./CalendarView.css";
import { CalendarEventList } from "./CalendarEventList";
import { fmtFullDate, fmtTime } from "./calendarHelpers";
import type { EnrichedEvent } from "./CalendarEventList";
import { CalendarEventModal } from "./CalendarEventModal";
import { CalendarEventDetail } from "./CalendarEventDetail";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { CalendarWeekView } from "./CalendarWeekView";
import { CalendarTimelineView } from "./CalendarTimelineView";
import { useCalendarView } from "./useCalendarView";
import type { CalendarFilter } from "./calendarTypes";

export type { FormState, ModalMode, CalendarFilter } from "./calendarTypes";

// ── Types ────────────────────────────────────────────────────────────────────

type Props = {
  calendars: Calendar[];
  currentMember: Member;
  activeMembers: Member[];
  roles: Role[];
  displayOnly?: boolean;
  calendarSettings?: CalendarSettings;
  filter?: CalendarFilter;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onRsvpEvent?: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
};

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarView({ calendars, currentMember, activeMembers, roles, displayOnly = false, calendarSettings, filter, onAddEvent, onUpdateEvent, onDeleteEvent, onRsvpEvent }: Props) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalHidden, setInternalHidden] = useState<Set<string>>(new Set());
  const [calView, setCalView] = useState<"month" | "week" | "timeline">("month");

  const searchQuery = filter?.searchQuery ?? internalSearch;
  const setSearchQuery = filter?.setSearchQuery ?? setInternalSearch;
  const hiddenCalendarIds = filter?.hiddenCalendarIds ?? internalHidden;
  const setHiddenCalendarIds = filter?.setHiddenCalendarIds ?? setInternalHidden;

  const {
    todayStr, viewYear, viewMonth, selectedDay, setSelectedDay,
    modal, form, setForm, detailEvent, setDetailEvent, longPressRef,
    visible, editableCalendars, canEditEvent, pendingInvitations,
    eventsForDay, listEvents, prevMonth, nextMonth,
    openNew, openEdit, closeModal, submitForm, deleteEvent,
    setField, toggleAttendee, weeks,
    showWeekNumbers, showHolidays, holidayBgColor, holidayTextColor,
    calendarDisplayColor, isEditing, eventIsEditable, otherMembers,
  } = useCalendarView(calendars, currentMember, activeMembers, roles, calendarSettings, searchQuery, hiddenCalendarIds, onAddEvent, onUpdateEvent, onDeleteEvent);

  const sharedListProps = { searchQuery, setSearchQuery, hiddenCalendarIds, setHiddenCalendarIds };

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

  const sharedGridProps = {
    viewYear, viewMonth, todayStr, selectedDay: selectedDay ?? null, weeks,
    showWeekNumbers, eventsForDay, showHolidays, holidayBgColor, holidayTextColor,
    calendarDisplayColor, onPrevMonth: prevMonth, onNextMonth: nextMonth,
    onSelectDay: (dateStr: string) => setSelectedDay((s) => s === dateStr ? null : dateStr),
  };

  const eventModal = modal ? (
    <CalendarEventModal
      modal={modal}
      isEditing={isEditing}
      eventIsEditable={eventIsEditable}
      form={form}
      setForm={setForm}
      editableCalendars={editableCalendars}
      otherMembers={otherMembers}
      onClose={closeModal}
      onSubmit={submitForm}
      onDelete={deleteEvent}
      onSetField={setField}
      onToggleAttendee={toggleAttendee}
    />
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
        <CalendarMonthGrid
          {...sharedGridProps}
          variant="mini"
          onDayTouchStart={handleDayTouchStart}
          onDayTouchEnd={handleDayTouchEnd}
        />
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
          {...sharedListProps}
          onEventClick={setDetailEvent}
          onClearDay={() => setSelectedDay(null)}
          onNewEvent={editableCalendars.length > 0 && onAddEvent ? () => openNew() : undefined}
        />
        {detailEvent && (
          <CalendarEventDetail
            event={detailEvent}
            calendarDisplayColor={calendarDisplayColor}
            activeMembers={activeMembers}
            canEditEvent={canEditEvent}
            onUpdateEvent={onUpdateEvent}
            onClose={() => setDetailEvent(null)}
            onEdit={(ev: EnrichedEvent) => openEdit(ev)}
          />
        )}
        {eventModal}
      </div>
    );
  }

  return (
    <div className="cal-view">
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

      <div className="cal-view-tabs">
        <button
          className={`cal-view-tab${calView === "month" ? " cal-view-tab--active" : ""}`}
          onClick={() => setCalView("month")}
          type="button"
        >
          Månad
        </button>
        <button
          className={`cal-view-tab${calView === "week" ? " cal-view-tab--active" : ""}`}
          onClick={() => setCalView("week")}
          type="button"
        >
          Vecka
        </button>
        <button
          className={`cal-view-tab${calView === "timeline" ? " cal-view-tab--active" : ""}`}
          onClick={() => setCalView("timeline")}
          type="button"
        >
          Tidslinje
        </button>
      </div>

      {calView === "week" ? (
        <CalendarWeekView
          visible={visible}
          calendarDisplayColor={calendarDisplayColor}
          todayStr={todayStr}
          showWeekNumbers={showWeekNumbers}
          onEventClick={openEdit}
        />
      ) : calView === "timeline" ? (
        <CalendarTimelineView
          visible={visible}
          calendarDisplayColor={calendarDisplayColor}
          todayStr={todayStr}
          showWeekNumbers={showWeekNumbers}
          onEventClick={openEdit}
        />
      ) : (
        <>
          <CalendarMonthGrid
            {...sharedGridProps}
            variant="full"
            onEventClick={openEdit}
          />
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
            {...sharedListProps}
            onEventClick={openEdit}
            onClearDay={() => setSelectedDay(null)}
            onNewEvent={editableCalendars.length > 0 ? () => openNew() : undefined}
          />
        </>
      )}
      {eventModal}
    </div>
  );
}
