import { Filter, MapPin, Plus, Repeat, Search } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Calendar, CalendarEvent } from "@shared/types";
import { fmtFullDate, fmtTime, isHolidayEvent } from "./calendarHelpers";

type CalendarCssVars = React.CSSProperties & {
  "--dot-color"?: string;
  "--event-bg"?: string;
  "--event-fg"?: string;
  "--filter-left"?: string;
  "--filter-max-height"?: string;
  "--filter-min-width"?: string;
  "--filter-top"?: string;
};

export type EnrichedEvent = CalendarEvent & {
  calendarColor: string;
  calendarName: string;
  calendarOwnerId?: string | null;
  displaySymbol?: string | null;
};

export type EventListProps = {
  allEvents: EnrichedEvent[];
  selectedDay: string | null;
  scope?: "month" | "week" | "all";
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
  navExtra?: ReactNode;
  onClearDay?: () => void;
  onNewEvent?: () => void;
};

export function CalendarEventList({
  allEvents, selectedDay, scope = "month", viewYear, viewMonth, visible,
  calendarDisplayColor, holidayBgColor, holidayTextColor,
  searchQuery, setSearchQuery, hiddenCalendarIds, setHiddenCalendarIds,
  onEventClick, navExtra, onClearDay, onNewEvent,
}: EventListProps) {
  const hasFilter = !!searchQuery.trim() || hiddenCalendarIds.size > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstCurrentRef = useRef<HTMLDivElement | null>(null);
  const now = Date.now();
  const firstCurrentIndex = allEvents.findIndex((ev) => isCurrentOrFutureEvent(ev, now));
  const listKey = allEvents.map((ev) => `${ev.id}:${ev.startsAt}:${ev.endsAt}`).join("|");

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const targetEl = firstCurrentRef.current;
    if (!scrollEl || !targetEl) return;

    const frame = window.requestAnimationFrame(() => {
      scrollEl.scrollTop = Math.max(0, targetEl.offsetTop - scrollEl.offsetTop - 6);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [listKey, selectedDay, scope, viewYear, viewMonth, searchQuery, hiddenCalendarIds.size]);

  return (
    <div className="cal-event-list">
      <div className="cal-event-list-header">
        {navExtra}
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
        <p className="cal-empty-note">{emptyNote(hasFilter, selectedDay, scope)}</p>
      ) : (
        <div className="cal-event-list-scroll" ref={scrollRef}>
          {allEvents.map((ev, index) => (
            <EventRow
              key={ev.id}
              ref={index === firstCurrentIndex ? firstCurrentRef : undefined}
              ev={ev}
              isPast={getEventEndTime(ev) < now}
              calendarDisplayColor={calendarDisplayColor}
              holidayBgColor={holidayBgColor}
              holidayTextColor={holidayTextColor}
              onEventClick={onEventClick}
            />
          ))}
        </div>
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
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 180 });

  useEffect(() => {
    if (!showFilter) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (filterButtonRef.current?.contains(target)) return;
      if (filterMenuRef.current?.contains(target)) return;
      setShowFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  function openFilter() {
    const rect = filterButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(Math.max(180, rect.width), window.innerWidth - 24);
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
      });
    }
    setShowFilter((current) => !current);
  }

  function toggleCalendar(calId: string, visible: boolean) {
    const next = new Set(hiddenCalendarIds);
    if (visible) next.delete(calId); else next.add(calId);
    setHiddenCalendarIds(next);
  }

  return (
    <div className="cal-filter-wrap">
      <button
        ref={filterButtonRef}
        className={`icon-button${hiddenCalendarIds.size > 0 ? " icon-button--active" : ""}`}
        onClick={openFilter}
        title="Filtrera kalendrar"
        type="button"
      >
        <Filter size={16} />
      </button>
      {showFilter && createPortal(
        <div
          className="cal-filter-dropdown"
          ref={filterMenuRef}
          style={{
            "--filter-top": `${menuPos.top}px`,
            "--filter-left": `${menuPos.left}px`,
            "--filter-min-width": `${menuPos.width}px`,
            "--filter-max-height": `min(320px, calc(100dvh - ${menuPos.top + 16}px))`,
          } as CalendarCssVars}
        >
          {visible.map((cal) => (
            <label className="cal-filter-item" key={cal.id}>
              <input
                checked={!hiddenCalendarIds.has(cal.id)}
                onChange={(e) => toggleCalendar(cal.id, e.target.checked)}
                type="checkbox"
              />
              <span className="cal-filter-dot" style={{ "--dot-color": cal.color } as CalendarCssVars} />
              <span>{cal.name}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

type RowProps = {
  ev: EnrichedEvent;
  isPast: boolean;
  calendarDisplayColor: Map<string, string>;
  holidayBgColor: string;
  holidayTextColor: string;
  onEventClick: (ev: EnrichedEvent) => void;
};

const EventRow = forwardRef<HTMLDivElement, RowProps>(function EventRow(
  { ev, isPast, calendarDisplayColor, holidayBgColor, holidayTextColor, onEventClick },
  ref
) {
  const holiday = isHolidayEvent(ev);
  const dotColor = holiday
    ? holidayBgColor
    : (ev.color ?? calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor);
  const eventStyle: CalendarCssVars = {
    "--dot-color": dotColor,
    ...(holiday ? { "--event-bg": holidayBgColor, "--event-fg": holidayTextColor } : {}),
  };
  const dateStr = ev.isAllDay
    ? `${fmtFullDate(ev.startsAt.slice(0, 10))} · Heldag`
    : `${fmtFullDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`;

  return (
    <div
      className={`cal-event-row${isPast ? " cal-event-row--past" : ""}${holiday ? " cal-event-row--holiday" : ""}`}
      onClick={() => onEventClick(ev)}
      ref={ref}
      style={eventStyle}
    >
      <div className="cal-event-color-dot" />
      <div className="cal-event-row-info">
        <span className="cal-event-row-title">
          {ev.displaySymbol && <span className="cal-event-symbol">{ev.displaySymbol}</span>}
          {ev.title}
          {ev.recurrence?.type !== "none" && (
            <Repeat className="cal-event-repeat-icon" size={12} />
          )}
        </span>
        <span className="cal-event-row-meta">
          {dateStr}
          {ev.location && (
            <> · <MapPin className="cal-meta-icon" size={11} /> {ev.location}</>
          )}
          {" · "}{ev.calendarName}
        </span>
      </div>
    </div>
  );
});

function emptyNote(hasFilter: boolean, selectedDay: string | null, scope: "month" | "week" | "all"): string {
  if (hasFilter) return "Inga händelser matchar filtret.";
  if (selectedDay) return "Inga händelser denna dag.";
  if (scope === "week") return "Inga händelser denna vecka.";
  if (scope === "all") return "Inga händelser i listan.";
  return "Inga händelser denna månad.";
}

function isCurrentOrFutureEvent(ev: EnrichedEvent, now: number) {
  return getEventEndTime(ev) >= now;
}

function getEventEndTime(ev: EnrichedEvent) {
  if (ev.isAllDay) {
    const end = new Date(`${ev.endsAt.slice(0, 10)}T23:59:59.999`);
    const time = end.getTime();
    return Number.isFinite(time) ? time : new Date(ev.endsAt).getTime();
  }

  return new Date(ev.endsAt).getTime();
}
