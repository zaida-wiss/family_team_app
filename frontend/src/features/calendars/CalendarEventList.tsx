import { Filter, MapPin, Plus, Repeat, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Calendar, CalendarEvent } from "@shared/types";
import { fmtFullDate, fmtTime, isHolidayEvent } from "./calendarHelpers";

export type EnrichedEvent = CalendarEvent & {
  calendarColor: string;
  calendarName: string;
  calendarOwnerId?: string | null;
  displaySymbol?: string | null;
};

export type EventListProps = {
  allEvents: EnrichedEvent[];
  selectedDay: string | null;
  viewYear: number;
  viewMonth: number;
  todayStr: string;
  visible: Calendar[];
  calendarDisplayColor: Map<string, string>;
  showHolidays: boolean;
  holidayBgColor: string;
  holidayTextColor: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  hiddenCalendarIds: Set<string>;
  setHiddenCalendarIds: (ids: Set<string>) => void;
  onEventClick: (ev: EnrichedEvent) => void;
  onClearDay?: () => void;
  onNewEvent?: () => void;
};

export function CalendarEventList({
  allEvents, selectedDay, visible,
  calendarDisplayColor, holidayBgColor, holidayTextColor,
  searchQuery, setSearchQuery, hiddenCalendarIds, setHiddenCalendarIds,
  onEventClick, onClearDay, onNewEvent,
}: EventListProps) {
  const hasFilter = !!searchQuery.trim() || hiddenCalendarIds.size > 0;

  return (
    <div className="cal-event-list">
      <div className="cal-event-list-header">
        <CalendarFilter
          visible={visible}
          hiddenCalendarIds={hiddenCalendarIds}
          setHiddenCalendarIds={setHiddenCalendarIds}
        />
        <div className="cal-overview-search">
          <Search size={14} className="cal-search-icon" />
          <input
            className="cal-search-input"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Sök händelser…"
            type="search"
            value={searchQuery}
          />
        </div>
        {selectedDay && onClearDay && (
          <button className="cal-clear-day" onClick={onClearDay} type="button">
            Visa alla
          </button>
        )}
        {onNewEvent && (
          <button className="icon-button" onClick={onNewEvent} title="Ny händelse" type="button">
            <Plus size={16} />
          </button>
        )}
      </div>

      {allEvents.length === 0 ? (
        <p className="cal-empty-note">{emptyNote(hasFilter, selectedDay)}</p>
      ) : (
        allEvents.map((ev) => (
          <EventRow
            key={ev.id}
            ev={ev}
            calendarDisplayColor={calendarDisplayColor}
            holidayBgColor={holidayBgColor}
            holidayTextColor={holidayTextColor}
            onEventClick={onEventClick}
          />
        ))
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

type FilterProps = {
  visible: Calendar[];
  hiddenCalendarIds: Set<string>;
  setHiddenCalendarIds: (ids: Set<string>) => void;
};

function CalendarFilter({ visible, hiddenCalendarIds, setHiddenCalendarIds }: FilterProps) {
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFilter) return;
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  function toggleCalendar(calId: string, visible: boolean) {
    const next = new Set(hiddenCalendarIds);
    if (visible) next.delete(calId); else next.add(calId);
    setHiddenCalendarIds(next);
  }

  return (
    <div className="cal-filter-wrap" ref={filterRef}>
      <button
        className={`icon-button${hiddenCalendarIds.size > 0 ? " icon-button--active" : ""}`}
        onClick={() => setShowFilter((s) => !s)}
        title="Filtrera kalendrar"
        type="button"
      >
        <Filter size={16} />
      </button>
      {showFilter && (
        <div className="cal-filter-dropdown">
          {visible.map((cal) => (
            <label className="cal-filter-item" key={cal.id}>
              <input
                checked={!hiddenCalendarIds.has(cal.id)}
                onChange={(e) => toggleCalendar(cal.id, e.target.checked)}
                type="checkbox"
              />
              <span className="cal-filter-dot" style={{ background: cal.color }} />
              <span>{cal.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

type RowProps = {
  ev: EnrichedEvent;
  calendarDisplayColor: Map<string, string>;
  holidayBgColor: string;
  holidayTextColor: string;
  onEventClick: (ev: EnrichedEvent) => void;
};

function EventRow({ ev, calendarDisplayColor, holidayBgColor, holidayTextColor, onEventClick }: RowProps) {
  const holiday = isHolidayEvent(ev);
  const dotColor = holiday
    ? holidayBgColor
    : (ev.color ?? calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor);
  const rowStyle = holiday
    ? { cursor: "pointer", background: holidayBgColor, color: holidayTextColor }
    : { cursor: "pointer" };
  const dateStr = ev.isAllDay
    ? `${fmtFullDate(ev.startsAt.slice(0, 10))} · Heldag`
    : `${fmtFullDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`;

  return (
    <div className="cal-event-row" onClick={() => onEventClick(ev)} style={rowStyle}>
      <div className="cal-event-color-dot" style={{ background: dotColor }} />
      <div className="cal-event-row-info">
        <span className="cal-event-row-title">
          {ev.displaySymbol && <span style={{ marginRight: "0.4em" }}>{ev.displaySymbol}</span>}
          {ev.title}
          {ev.recurrence?.type !== "none" && (
            <Repeat size={12} style={{ marginLeft: 5, opacity: 0.55, verticalAlign: "middle" }} />
          )}
        </span>
        <span
          className="cal-event-row-meta"
          style={holiday ? { color: holidayTextColor } : undefined}
        >
          {dateStr}
          {ev.location && (
            <> · <MapPin size={11} style={{ verticalAlign: "middle" }} /> {ev.location}</>
          )}
          {" · "}{ev.calendarName}
        </span>
      </div>
    </div>
  );
}

function emptyNote(hasFilter: boolean, selectedDay: string | null): string {
  if (hasFilter) return "Inga händelser matchar filtret.";
  if (selectedDay) return "Inga händelser denna dag.";
  return "Inga händelser denna månad.";
}
