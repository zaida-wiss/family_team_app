import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./ChildWeekStrip.css";

type DayPillStyle = CSSProperties & { "--day-bg"?: string; "--day-fg"?: string };

const WEEKDAY_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];

function isSameLocalDay(isoStr: string, date: Date) {
  const candidate = new Date(isoStr);
  return (
    candidate.getFullYear() === date.getFullYear() &&
    candidate.getMonth() === date.getMonth() &&
    candidate.getDate() === date.getDate()
  );
}

function getDayStyle(dayIndex: number): DayPillStyle {
  return {
    "--day-bg": `var(--day-${dayIndex}-bg)`,
    "--day-fg": `var(--day-${dayIndex}-fg)`,
  };
}

type Props = {
  days: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

export function ChildWeekStrip({ days, selectedDay, onSelectDay, onPrevWeek, onNextWeek }: Props) {
  return (
    <div className="child-week-nav">
      <button className="child-week-arrow" type="button" onClick={onPrevWeek} aria-label="Föregående vecka">
        <ChevronLeft size={18} />
      </button>

      <div className="child-day-strip" aria-label="Veckodagar">
        {days.map((day) => {
          const isSelected = isSameLocalDay(day.toISOString(), selectedDay);
          return (
            <button
              key={day.toISOString()}
              className={`child-day-pill${isSelected ? " child-day-pill--selected" : ""}`}
              type="button"
              style={getDayStyle(day.getDay())}
              onClick={() => onSelectDay(day)}
              aria-pressed={isSelected}
            >
              <span>{WEEKDAY_SHORT[day.getDay()]}</span>
              <strong>{day.getDate()}</strong>
            </button>
          );
        })}
      </div>

      <button className="child-week-arrow" type="button" onClick={onNextWeek} aria-label="Nästa vecka">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
