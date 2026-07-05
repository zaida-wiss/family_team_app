import "./RecurrencePicker.css";
import type { RecurrenceRule, RecurrenceUnit, Weekday } from "@shared/types";
import { WEEKDAY_SHORT } from "./recurringTodos";

const WEEKDAY_ORDER: Weekday[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
];

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "dag",
  week: "vecka",
  month: "månad"
};

type Props = {
  value: RecurrenceRule;
  onChange: (value: RecurrenceRule) => void;
};

function toggleDay(days: Weekday[], day: Weekday): Weekday[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
}

// Veckodagarna startar tomma som default (Zaidas beslut) — men minst en dag
// måste väljas innan uppgiften faktiskt kan sparas som veckovis återkommande.
// Delad mellan TodoCreatorModal och TodoEditModal för att blockera spara-knappen.
export function isRecurrenceIncomplete(recurrence: RecurrenceRule): boolean {
  return recurrence.type === "recurring" && recurrence.unit === "week" && recurrence.daysOfWeek?.length === 0;
}

// Delad återkommande-väljare (2026-07-05, ADR-0015) — enhet (dag/vecka/månad)
// + intervall (varannan/var tredje/…) + veckodags-kryssrutor (bara relevanta
// för vecka), kombinerbara. Ersätter den tidigare duplicerade
// createRecurrence()-hjälpfunktionen i både TodoCreatorModal och
// TodoEditModal — används av båda.
export function RecurrencePicker({ value, onChange }: Props) {
  const isRecurring = value.type === "recurring";

  function setRecurring(recurring: boolean) {
    onChange(
      recurring
        ? { type: "recurring", unit: "week", every: 1, daysOfWeek: [] }
        : { type: "none" }
    );
  }

  function setUnit(unit: RecurrenceUnit) {
    if (value.type !== "recurring") return;
    onChange({
      type: "recurring",
      unit,
      every: value.every,
      daysOfWeek: unit === "week" ? value.daysOfWeek ?? [] : null
    });
  }

  function setEvery(every: number) {
    if (value.type !== "recurring") return;
    onChange({ ...value, every: Math.max(1, Math.floor(every) || 1) });
  }

  function setDaysOfWeek(days: Weekday[]) {
    if (value.type !== "recurring") return;
    onChange({ ...value, daysOfWeek: days });
  }

  return (
    <div className="recurrence-picker">
      <label className="field-label">
        Återkommer
        <select
          className="text-input"
          onChange={(e) => setRecurring(e.target.value === "recurring")}
          value={isRecurring ? "recurring" : "none"}
        >
          <option value="none">Inte återkommande</option>
          <option value="recurring">Återkommande</option>
        </select>
      </label>

      {value.type === "recurring" && (
        <>
          <div className="recurrence-picker__interval-label">Upprepas var</div>
          <div className="recurrence-picker__interval">
            <input
              aria-label="Intervall"
              className="text-input recurrence-picker__every"
              min={1}
              onChange={(e) => setEvery(Number(e.target.value))}
              type="number"
              value={value.every}
            />
            <span>:e</span>
            <select
              aria-label="Enhet för återkommelse"
              className="text-input"
              onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
              value={value.unit}
            >
              <option value="day">{UNIT_LABEL.day}</option>
              <option value="week">{UNIT_LABEL.week}</option>
              <option value="month">{UNIT_LABEL.month}</option>
            </select>
          </div>

          {value.unit === "week" && (
            <div aria-label="Veckodagar" className="recurrence-picker__days" role="group">
              {WEEKDAY_ORDER.map((day) => (
                <button
                  aria-pressed={value.daysOfWeek?.includes(day) ?? false}
                  className={
                    "recurrence-picker__day" +
                    (value.daysOfWeek?.includes(day) ? " recurrence-picker__day--on" : "")
                  }
                  key={day}
                  onClick={() => setDaysOfWeek(toggleDay(value.daysOfWeek ?? [], day))}
                  type="button"
                >
                  {WEEKDAY_SHORT[day]}
                </button>
              ))}
            </div>
          )}

          {isRecurrenceIncomplete(value) && (
            <p className="recurrence-picker__hint">Välj minst en veckodag.</p>
          )}
        </>
      )}
    </div>
  );
}
