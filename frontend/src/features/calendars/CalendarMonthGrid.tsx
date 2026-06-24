import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { Fragment } from "react";
import type { EnrichedEvent } from "./CalendarEventList";
import { DAYS, MONTHS, fmtTime, getISOWeek, isHolidayEvent, toLocalDateStr } from "./calendarHelpers";

type CalDay = { date: Date; isCurrentMonth: boolean };

type Props = {
  viewYear: number;
  viewMonth: number;
  todayStr: string;
  selectedDay: string | null;
  weeks: CalDay[][];
  showWeekNumbers: boolean;
  eventsForDay: (dateStr: string) => EnrichedEvent[];
  showHolidays: boolean;
  holidayBgColor: string;
  holidayTextColor: string;
  calendarDisplayColor: Map<string, string>;
  variant: "mini" | "full";
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (dateStr: string) => void;
  onDayTouchStart?: (dateStr: string) => void;
  onDayTouchEnd?: () => void;
  onEventClick?: (ev: EnrichedEvent) => void;
};

export function CalendarMonthGrid({
  viewYear, viewMonth, todayStr, selectedDay, weeks,
  showWeekNumbers, eventsForDay, showHolidays,
  holidayBgColor, holidayTextColor, calendarDisplayColor,
  variant, onPrevMonth, onNextMonth, onSelectDay,
  onDayTouchStart, onDayTouchEnd, onEventClick,
}: Props) {
  return (
    <div className="cal-grid-card">
      <div className="cal-grid-nav">
        <button className="icon-button" onClick={onPrevMonth} type="button"><ChevronLeft size={18} /></button>
        <span className="cal-grid-month">{MONTHS[viewMonth]} {viewYear}</span>
        <button className="icon-button" onClick={onNextMonth} type="button"><ChevronRight size={18} /></button>
      </div>

      <div className={`cal-day-names${showWeekNumbers ? " cal-day-names--wk" : ""}`}>
        {showWeekNumbers && <span className="cal-wk-label" />}
        {DAYS.map((d) => <span key={d}>{d}</span>)}
      </div>

      <div className={`cal-grid${showWeekNumbers ? " cal-grid--wk" : ""}`}>
        {weeks.map((week) => (
          <Fragment key={week[0].date.getTime()}>
            {showWeekNumbers && (
              <span className="cal-wk-num">v.{getISOWeek(week[0].date)}</span>
            )}
            {week.map(({ date, isCurrentMonth }) => {
              const dateStr = toLocalDateStr(date);
              const dayEvents = isCurrentMonth
                ? eventsForDay(dateStr).filter((ev) => showHolidays || !isHolidayEvent(ev))
                : [];
              const cls = [
                "cal-cell",
                !isCurrentMonth && "cal-cell--other",
                dateStr === todayStr && "cal-cell--today",
                dateStr === selectedDay && "cal-cell--selected",
              ].filter(Boolean).join(" ");

              return (
                <div
                  key={dateStr}
                  className={cls}
                  onClick={() => { if (isCurrentMonth) onSelectDay(dateStr); }}
                  onTouchCancel={onDayTouchEnd}
                  onTouchEnd={onDayTouchEnd}
                  onTouchStart={() => { if (isCurrentMonth) onDayTouchStart?.(dateStr); }}
                >
                  <span className="cal-cell-num">{date.getDate()}</span>
                  {variant === "mini" ? (
                    <div className="cal-cell-dots">
                      {dayEvents.slice(0, 5).map((ev) => (
                        <span
                          key={ev.id}
                          className="cal-cell-dot"
                          style={{ background: isHolidayEvent(ev) ? holidayBgColor : (calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor) }}
                          title={ev.title}
                        />
                      ))}
                      {dayEvents.length > 5 && <span className="cal-cell-dot-more">+{dayEvents.length - 5}</span>}
                    </div>
                  ) : (
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
                            onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
                          >
                            {ev.displaySymbol
                              ? ev.displaySymbol
                              : <>{!ev.isAllDay && `${fmtTime(ev.startsAt)} `}{ev.title}</>}
                            {ev.recurrence?.type !== "none" && <Repeat size={8} style={{ marginLeft: 2, opacity: 0.7 }} />}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <span className="cal-event-more">+{dayEvents.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
