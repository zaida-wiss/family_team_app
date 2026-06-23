import { Filter, MapPin, Plus, Repeat, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Calendar, CalendarEvent } from "@shared/types";
import { fmtFullDate, fmtTime, isHolidayEvent, toLocalDateStr } from "./calendarHelpers";

export type EnrichedEvent = CalendarEvent & { calendarColor: string; calendarName: string; calendarOwnerId?: string | null };

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
  onEventClick: (ev: EnrichedEvent) => void;
  onClearDay?: () => void;
  onNewEvent?: () => void;
};

export function CalendarEventList({
  allEvents, selectedDay, viewYear, viewMonth, todayStr,
  visible, calendarDisplayColor, showHolidays, holidayBgColor, holidayTextColor,
  onEventClick, onClearDay, onNewEvent,
}: EventListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearchQuery(""); setHiddenCalendarIds(new Set()); }, [viewYear, viewMonth]);

  useEffect(() => {
    if (!showFilter) return;
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  const q = searchQuery.trim().toLowerCase();
  const hasFilter = !!q || hiddenCalendarIds.size > 0;

  // When viewing the current month without filters: hide past events.
  // When browsing a past or future month: show everything (user navigated there intentionally).
  const todayYM = todayStr.slice(0, 7); // "YYYY-MM"
  const viewYM = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const isCurrentMonth = viewYM === todayYM;
  const hidePast = isCurrentMonth && !selectedDay && !hasFilter;

  const filtered = allEvents
    .filter((ev) => hiddenCalendarIds.size === 0 || !hiddenCalendarIds.has(ev.calendarId))
    .filter((ev) => showHolidays || !isHolidayEvent(ev))
    .filter((ev) => {
      if (hidePast) {
        const end = ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
        return end >= todayStr;
      }
      return true;
    })
    .filter((ev) => !q || (
      ev.title.toLowerCase().includes(q) ||
      ev.calendarName.toLowerCase().includes(q) ||
      (ev.location?.toLowerCase().includes(q) ?? false) ||
      (ev.notes?.replace(/\\n/g, " ").toLowerCase().includes(q) ?? false)
    ));

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
                      setHiddenCalendarIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(cal.id); else next.add(cal.id);
                        return next;
                      });
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

      {filtered.length === 0 ? (
        <p className="cal-empty-note">
          {hasFilter
            ? "Inga händelser matchar filtret."
            : selectedDay
              ? "Inga händelser denna dag."
              : "Inga händelser denna månad."}
        </p>
      ) : (
        filtered.map((ev) => {
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
