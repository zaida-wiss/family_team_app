import { Filter, MapPin, Plus, Repeat, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Calendar, CalendarEvent } from "@shared/types";
import { fmtFullDate, fmtTime, isHolidayEvent } from "./calendarHelpers";

export type EnrichedEvent = CalendarEvent & { calendarColor: string; calendarName: string; calendarOwnerId?: string | null; displaySymbol?: string | null };

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
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showFilter) return;
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  const hasFilter = !!searchQuery.trim() || hiddenCalendarIds.size > 0;

  return (
    <div className="cal-event-list">
      <div className="cal-event-list-header">
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
                    onChange={(e) => {
                      const next = new Set(hiddenCalendarIds);
                      if (e.target.checked) next.delete(cal.id); else next.add(cal.id);
                      setHiddenCalendarIds(next);
                    }}
                    type="checkbox"
                  />
                  <span className="cal-filter-dot" style={{ background: cal.color }} />
                  <span>{cal.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
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
          <button className="cal-clear-day" onClick={onClearDay} type="button">Visa alla</button>
        )}
        {onNewEvent && (
          <button className="icon-button" onClick={onNewEvent} title="Ny händelse" type="button">
            <Plus size={16} />
          </button>
        )}
      </div>

      {allEvents.length === 0 ? (
        <p className="cal-empty-note">
          {hasFilter
            ? "Inga händelser matchar filtret."
            : selectedDay
              ? "Inga händelser denna dag."
              : "Inga händelser denna månad."}
        </p>
      ) : (
        allEvents.map((ev) => {
          const holiday = isHolidayEvent(ev);
          return (
            <div
              className="cal-event-row"
              key={ev.id}
              onClick={() => onEventClick(ev)}
              style={{ cursor: "pointer", ...(holiday ? { background: holidayBgColor, color: holidayTextColor } : {}) }}
            >
              <div className="cal-event-color-dot" style={{ background: holiday ? holidayBgColor : (ev.color ?? calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor) }} />
              <div className="cal-event-row-info">
                <span className="cal-event-row-title">
                  {ev.displaySymbol && <span style={{ marginRight: 4 }}>{ev.displaySymbol}</span>}
                  {ev.title}
                  {ev.recurrence?.type !== "none" && <Repeat size={12} style={{ marginLeft: 5, opacity: 0.55, verticalAlign: "middle" }} />}
                </span>
                <span className="cal-event-row-meta" style={holiday ? { color: holidayTextColor } : undefined}>
                  {ev.isAllDay
                    ? `${fmtFullDate(ev.startsAt.slice(0, 10))} · Heldag`
                    : `${fmtFullDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`}
                  {ev.location && <> · <MapPin size={11} style={{ verticalAlign: "middle" }} /> {ev.location}</>}
                  {" · "}{ev.calendarName}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
