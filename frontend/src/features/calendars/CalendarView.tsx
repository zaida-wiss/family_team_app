import { useRef, useState } from "react";
import { CalendarDays, CalendarRange, Clock3, List } from "lucide-react";
import type { Calendar, CalendarEvent, CalendarSettings, CalendarViewMode, Id, Member, Role } from "@shared/types";
import "./CalendarView.css";
import { CalendarEventList } from "./CalendarEventList";
import { fmtFullDate, fmtTime } from "./calendarHelpers";
import type { EnrichedEvent } from "./CalendarEventList";
import { CalendarEventModal } from "./CalendarEventModal";
import { CalendarEventDetail } from "./CalendarEventDetail";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { CalendarMonthLayout } from "./CalendarMonthLayout";
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
  calendarView?: CalendarViewMode;
  filter?: CalendarFilter;
  onCalendarViewChange?: (view: CalendarViewMode) => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onRsvpEvent?: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
};

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarView({ calendars, currentMember, activeMembers, roles, displayOnly = false, calendarSettings, calendarView, filter, onCalendarViewChange, onAddEvent, onUpdateEvent, onDeleteEvent, onRsvpEvent }: Props) {
  const [internalSearch, setInternalSearch] = useState("");
  const [internalHidden, setInternalHidden] = useState<Set<string>>(new Set());
  const [internalCalView, setInternalCalView] = useState<CalendarViewMode>("month");
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const searchQuery = filter?.searchQuery ?? internalSearch;
  const setSearchQuery = filter?.setSearchQuery ?? setInternalSearch;
  const hiddenCalendarIds = filter?.hiddenCalendarIds ?? internalHidden;
  const setHiddenCalendarIds = filter?.setHiddenCalendarIds ?? setInternalHidden;
  const calView = calendarView ?? internalCalView;
  const setCalView = onCalendarViewChange ?? setInternalCalView;

  const {
    todayStr, viewYear, viewMonth, selectedDay, setSelectedDay,
    weekStart, weekEnd,
    modal, form, setForm, detailEvent, setDetailEvent, longPressRef,
    visible, editableCalendars, canEditEvent, pendingInvitations,
    eventsForDay, listEvents, weekEvents, weekListEvents, allListEvents, prevMonth, nextMonth, prevWeek, nextWeek,
    openNew, openEdit, closeModal, submitForm, deleteEvent,
    setField, toggleAttendee, weeks,
    showWeekNumbers, showHolidays, holidayBgColor, holidayTextColor,
    calendarDisplayColor, isEditing, eventIsEditable, otherMembers,
  } = useCalendarView(calendars, currentMember, activeMembers, roles, calendarSettings, searchQuery, hiddenCalendarIds, onAddEvent, onUpdateEvent, onDeleteEvent);

  const sharedListProps = { searchQuery, setSearchQuery, hiddenCalendarIds, setHiddenCalendarIds };
  const filteredVisible = visible.filter((calendar) => !hiddenCalendarIds.has(calendar.id));

  function startSwipe(e: React.TouchEvent<HTMLElement>) {
    const touch = e.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function endSwipe(e: React.TouchEvent<HTMLElement>, onPrev: () => void, onNext: () => void) {
    const start = touchStartRef.current;
    const touch = e.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0) onNext();
    else onPrev();
  }

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

  const detailModal = detailEvent ? (
    <CalendarEventDetail
      event={detailEvent}
      calendarDisplayColor={calendarDisplayColor}
      activeMembers={activeMembers}
      canEditEvent={canEditEvent}
      onUpdateEvent={onUpdateEvent}
      onClose={() => setDetailEvent(null)}
      onEdit={(ev: EnrichedEvent) => {
        setDetailEvent(null);
        openEdit(ev);
      }}
    />
  ) : null;

  const viewTabs = (
    <div className="cal-view-tabs" aria-label="Kalendervy" role="group">
      <button
        aria-label="Månadsvy"
        className={`cal-view-tab${calView === "month" ? " cal-view-tab--active" : ""}`}
        onClick={() => setCalView("month")}
        title="Månadsvy"
        type="button"
      >
        <CalendarDays size={16} />
      </button>
      <button
        aria-label="Veckovy"
        className={`cal-view-tab${calView === "week" ? " cal-view-tab--active" : ""}`}
        onClick={() => setCalView("week")}
        title="Veckovy"
        type="button"
      >
        <CalendarRange size={16} />
      </button>
      <button
        aria-label="Lista"
        className={`cal-view-tab${calView === "list" ? " cal-view-tab--active" : ""}`}
        onClick={() => setCalView("list")}
        title="Lista"
        type="button"
      >
        <List size={16} />
      </button>
      <button
        aria-label="Tidslinje"
        className={`cal-view-tab${calView === "timeline" ? " cal-view-tab--active" : ""}`}
        onClick={() => setCalView("timeline")}
        title="Tidslinje"
        type="button"
      >
        <Clock3 size={16} />
      </button>
    </div>
  );

  if (displayOnly) {
    const handleDayTouchStart = (dateStr: string) => {
      if (editableCalendars.length === 0 || !onAddEvent) return;
      longPressRef.current = setTimeout(() => { openNew(dateStr); }, 600);
    };
    const handleDayTouchEnd = () => {
      if (longPressRef.current !== null) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    };

    return (
      <div className="cal-view cal-view--overview">
        {calView === "week" ? (
          <div
            className="cal-view-with-list cal-swipe-region"
            onTouchEnd={(e) => endSwipe(e, prevWeek, nextWeek)}
            onTouchStart={startSwipe}
          >
            <CalendarWeekView
              weekEvents={weekEvents}
              weekStart={weekStart}
              weekEnd={weekEnd}
              todayStr={todayStr}
              showWeekNumbers={showWeekNumbers}
              eventDisplay="dots"
              onPrevWeek={prevWeek}
              onNextWeek={nextWeek}
              navExtra={viewTabs}
              onEventClick={setDetailEvent}
            />
            <CalendarEventList
              key={`week-${weekStart.toISOString()}`}
              allEvents={weekListEvents}
              selectedDay={null}
              scope="week"
              viewYear={weekStart.getFullYear()}
              viewMonth={weekStart.getMonth()}
              todayStr={todayStr}
              visible={visible}
              calendarDisplayColor={calendarDisplayColor}
              showHolidays={showHolidays}
              holidayBgColor={holidayBgColor}
              holidayTextColor={holidayTextColor}
              {...sharedListProps}
              onEventClick={setDetailEvent}
              onNewEvent={editableCalendars.length > 0 && onAddEvent ? () => openNew() : undefined}
            />
          </div>
        ) : calView === "list" ? (
          <CalendarEventList
            key="list"
            allEvents={allListEvents}
            selectedDay={null}
            scope="all"
            viewYear={viewYear}
            viewMonth={viewMonth}
            todayStr={todayStr}
            visible={visible}
            calendarDisplayColor={calendarDisplayColor}
            showHolidays={showHolidays}
            holidayBgColor={holidayBgColor}
            holidayTextColor={holidayTextColor}
            {...sharedListProps}
            navExtra={viewTabs}
            onEventClick={setDetailEvent}
            onNewEvent={editableCalendars.length > 0 && onAddEvent ? () => openNew() : undefined}
          />
        ) : calView === "timeline" ? (
          <CalendarTimelineView
            visible={filteredVisible}
            calendarDisplayColor={calendarDisplayColor}
            todayStr={todayStr}
            showWeekNumbers={showWeekNumbers}
            navExtra={viewTabs}
            onEventClick={setDetailEvent}
          />
        ) : (
          <CalendarMonthLayout
            className="cal-swipe-region"
            onTouchEnd={(e) => endSwipe(e, prevMonth, nextMonth)}
            onTouchStart={startSwipe}
            variant="overview"
          >
            <CalendarMonthGrid
              {...sharedGridProps}
              variant="mini"
              navExtra={viewTabs}
              onDayTouchStart={handleDayTouchStart}
              onDayTouchEnd={handleDayTouchEnd}
            />
            <CalendarEventList
              key={`${viewYear}-${viewMonth}`}
              allEvents={listEvents}
              selectedDay={selectedDay}
              scope="month"
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
          </CalendarMonthLayout>
        )}
        {detailModal}
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

      {calView === "week" ? (
        <div
          className="cal-view-with-list cal-swipe-region"
          onTouchEnd={(e) => endSwipe(e, prevWeek, nextWeek)}
          onTouchStart={startSwipe}
        >
          <CalendarWeekView
            weekEvents={weekEvents}
            weekStart={weekStart}
            weekEnd={weekEnd}
            todayStr={todayStr}
            showWeekNumbers={showWeekNumbers}
            onPrevWeek={prevWeek}
            onNextWeek={nextWeek}
            navExtra={viewTabs}
            onEventClick={setDetailEvent}
          />
          <CalendarEventList
            key={`week-${weekStart.toISOString()}`}
            allEvents={weekListEvents}
            selectedDay={null}
            scope="week"
            viewYear={weekStart.getFullYear()}
            viewMonth={weekStart.getMonth()}
            todayStr={todayStr}
            visible={visible}
            calendarDisplayColor={calendarDisplayColor}
            showHolidays={showHolidays}
            holidayBgColor={holidayBgColor}
            holidayTextColor={holidayTextColor}
            {...sharedListProps}
            onEventClick={setDetailEvent}
            onNewEvent={editableCalendars.length > 0 ? () => openNew() : undefined}
          />
        </div>
      ) : calView === "list" ? (
        <CalendarEventList
          key="list"
          allEvents={allListEvents}
          selectedDay={null}
          scope="all"
          viewYear={viewYear}
          viewMonth={viewMonth}
          todayStr={todayStr}
          visible={visible}
          calendarDisplayColor={calendarDisplayColor}
          showHolidays={showHolidays}
          holidayBgColor={holidayBgColor}
          holidayTextColor={holidayTextColor}
          {...sharedListProps}
          navExtra={viewTabs}
          onEventClick={setDetailEvent}
          onNewEvent={editableCalendars.length > 0 ? () => openNew() : undefined}
        />
      ) : calView === "timeline" ? (
        <CalendarTimelineView
          visible={filteredVisible}
          calendarDisplayColor={calendarDisplayColor}
          todayStr={todayStr}
          showWeekNumbers={showWeekNumbers}
          navExtra={viewTabs}
          onEventClick={setDetailEvent}
        />
      ) : (
        <CalendarMonthLayout
          className="cal-swipe-region"
          onTouchEnd={(e) => endSwipe(e, prevMonth, nextMonth)}
          onTouchStart={startSwipe}
        >
          <CalendarMonthGrid
            {...sharedGridProps}
            variant="full"
            navExtra={viewTabs}
            onEventClick={setDetailEvent}
          />
          <CalendarEventList
            key={`${viewYear}-${viewMonth}`}
            allEvents={listEvents}
            selectedDay={selectedDay}
            scope="month"
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
            onNewEvent={editableCalendars.length > 0 ? () => openNew() : undefined}
          />
        </CalendarMonthLayout>
      )}
      {detailModal}
      {eventModal}
    </div>
  );
}
