import "./RecurrencePicker.css";
import { useState } from "react";
import type { RecurrenceEnd, RecurrenceRule, RecurrenceUnit, Weekday } from "@shared/types";
import { WEEKDAY_SHORT } from "./recurringTodos";

const WEEKDAY_ORDER: Weekday[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
];

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "dag",
  week: "vecka",
  month: "månad",
  year: "år"
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

// Delad återkommande-väljare (2026-07-05, ADR-0015) — enhet (dag/vecka/månad/
// år) + intervall (varannan/var tredje/…) + veckodags-kryssrutor (bara
// relevanta för vecka) + slutvillkor (2026-07-07), kombinerbara. Ersätter den
// tidigare duplicerade createRecurrence()-hjälpfunktionen i både
// TodoCreatorModal och TodoEditModal — används av båda.
export function RecurrencePicker({ value, onChange }: Props) {
  const isRecurring = value.type === "recurring";
  const end: RecurrenceEnd = (isRecurring && value.end) || { type: "never" };

  // Sträng, inte tal (samma "envis nolla vid tömning"-fix som Stjärnor-fältet,
  // 2026-07-07) — bara denna komponent skriver till end.count, så lokalt state
  // som initieras en gång vid montering (modalen monteras om per redigerad
  // uppgift) håller sig i synk utan extra tillsynkronisering.
  const [countInput, setCountInput] = useState(
    String(end.type === "count" ? end.count : 1)
  );

  function setRecurring(recurring: boolean) {
    onChange(
      recurring
        ? { type: "recurring", unit: "week", every: 1, daysOfWeek: [], end: { type: "never" } }
        : { type: "none" }
    );
  }

  function setUnit(unit: RecurrenceUnit) {
    if (value.type !== "recurring") return;
    onChange({
      type: "recurring",
      unit,
      every: value.every,
      daysOfWeek: unit === "week" ? value.daysOfWeek ?? [] : null,
      end: value.end
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

  function setEndType(type: RecurrenceEnd["type"]) {
    if (value.type !== "recurring") return;
    if (type === "never") {
      onChange({ ...value, end: { type: "never" } });
    } else if (type === "until") {
      onChange({ ...value, end: { type: "until", date: "" } });
    } else {
      onChange({ ...value, end: { type: "count", count: Math.max(1, Math.floor(Number(countInput)) || 1) } });
    }
  }

  function setEndDate(date: string) {
    if (value.type !== "recurring") return;
    onChange({ ...value, end: { type: "until", date } });
  }

  function setEndCountInput(input: string) {
    setCountInput(input);
    if (value.type !== "recurring") return;
    onChange({ ...value, end: { type: "count", count: Math.max(1, Math.floor(Number(input)) || 1) } });
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
              <option value="year">{UNIT_LABEL.year}</option>
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

          <label className="field-label">
            Slutar
            <select
              aria-label="Slutar"
              className="text-input"
              onChange={(e) => setEndType(e.target.value as RecurrenceEnd["type"])}
              value={end.type}
            >
              <option value="never">Aldrig</option>
              <option value="until">På ett datum</option>
              <option value="count">Efter ett antal gånger</option>
            </select>
          </label>

          {end.type === "until" && (
            <label className="field-label">
              Slutdatum
              <input
                className="text-input"
                onChange={(e) => setEndDate(e.target.value)}
                type="date"
                value={end.date}
              />
            </label>
          )}

          {end.type === "count" && (
            <label className="field-label">
              Antal gånger
              <input
                className="text-input"
                min={1}
                onChange={(e) => setEndCountInput(e.target.value)}
                type="number"
                value={countInput}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
