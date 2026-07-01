import { useEffect, useRef, useState } from "react";
import "./DateInput.css";

type Props = {
  value: string; // "" eller "ÅÅÅÅ-MM-DD"
  onChange: (v: string) => void;
  id?: string; // sätts på år-inputen så att en <label htmlFor> kan kopplas
};

const FULL = /^\d{4}-\d{2}-\d{2}$/;

export function DateInput({ value, onChange, id }: Props) {
  const init = FULL.test(value)
    ? { year: value.slice(0, 4), month: value.slice(5, 7), day: value.slice(8, 10) }
    : { year: "", month: "", day: "" };

  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [day, setDay] = useState(init.day);

  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  // Synka om värdet ändras externt (t.ex. formulär-reset)
  useEffect(() => {
    if (FULL.test(value)) {
      setYear(value.slice(0, 4));
      setMonth(value.slice(5, 7));
      setDay(value.slice(8, 10));
    } else if (!value) {
      setYear("");
      setMonth("");
      setDay("");
    }
  }, [value]);

  function emit(y: string, m: string, d: string) {
    onChange(y.length === 4 && m.length === 2 && d.length === 2 ? `${y}-${m}-${d}` : "");
  }

  return (
    <div className="date-input" role="group">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={4}
        placeholder="ÅÅÅÅ"
        value={year}
        aria-label="År"
        className="date-input__year"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          setYear(v);
          emit(v, month, day);
          if (v.length === 4) monthRef.current?.focus();
        }}
      />
      <span className="date-input__sep" aria-hidden="true">-</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder="MM"
        value={month}
        aria-label="Månad"
        className="date-input__segment"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2);
          setMonth(v);
          emit(year, v, day);
          if (v.length === 2) dayRef.current?.focus();
        }}
      />
      <span className="date-input__sep" aria-hidden="true">-</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder="DD"
        value={day}
        aria-label="Dag"
        className="date-input__segment"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2);
          setDay(v);
          emit(year, month, v);
        }}
      />
    </div>
  );
}
