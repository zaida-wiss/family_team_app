import "./AvailabilityEditor.css";
import { useState } from "react";
import type { ShopAvailability, ShopAvailabilityWindow, ShopTimeInterval, Weekday } from "@shared/types";
import { DateInput } from "../../components/DateInput";

type Props = {
  value: ShopAvailability | null;
  onChange: (v: ShopAvailability | null) => void;
};

const WEEKDAY_ORDER: Weekday[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
];

const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: "mån", tuesday: "tis", wednesday: "ons", thursday: "tors",
  friday: "fre", saturday: "lör", sunday: "sön"
};

const emptyWindow = (): ShopAvailabilityWindow => ({ daysOfWeek: [], timeIntervals: [] });
const empty = (): ShopAvailability => ({ startDate: null, endDate: null, windows: [] });

// Flera "tidsfönster" (2026-08-29, Zaidas önskemål om olika tider för olika
// dagar, t.ex. måndag 15-17, onsdag 18-20) — varje fönster har egna
// veckodagar + egna tidsintervall, varan är tillgänglig om NÅGOT fönster
// matchar. Se ShopAvailabilityWindow i shared/types.ts och isAvailableNow i
// shared/rewardShopAvailability.ts för den auktoritativa tolkningen.
export function AvailabilityEditor({ value, onChange }: Props) {
  const [open, setOpen] = useState(value !== null);
  const av = value ?? empty();

  function toggle() {
    if (open) {
      onChange(null);
      setOpen(false);
    } else {
      onChange(empty());
      setOpen(true);
    }
  }

  function patch(partial: Partial<ShopAvailability>) {
    onChange({ ...av, ...partial });
  }

  function patchWindow(i: number, partial: Partial<ShopAvailabilityWindow>) {
    patch({ windows: av.windows.map((w, idx) => (idx === i ? { ...w, ...partial } : w)) });
  }

  function addWindow() {
    patch({ windows: [...av.windows, emptyWindow()] });
  }

  function removeWindow(i: number) {
    patch({ windows: av.windows.filter((_, idx) => idx !== i) });
  }

  function toggleWindowDay(i: number, day: Weekday) {
    const days = av.windows[i].daysOfWeek;
    patchWindow(i, { daysOfWeek: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  }

  function addWindowInterval(i: number) {
    patchWindow(i, { timeIntervals: [...av.windows[i].timeIntervals, { start: "08:00", end: "09:00" }] });
  }

  function updateWindowInterval(i: number, ii: number, field: keyof ShopTimeInterval, val: string) {
    const updated = av.windows[i].timeIntervals.map((iv, idx) => (idx === ii ? { ...iv, [field]: val } : iv));
    patchWindow(i, { timeIntervals: updated });
  }

  function removeWindowInterval(i: number, ii: number) {
    patchWindow(i, { timeIntervals: av.windows[i].timeIntervals.filter((_, idx) => idx !== ii) });
  }

  return (
    <div className="availability-editor">
      <button
        type="button"
        className="availability-editor__toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? "✕ Ta bort tillgänglighetsregler" : "+ Begränsa när belöningen är tillgänglig"}
      </button>

      {open && (
        <div className="availability-editor__body">
          <div className="availability-editor__dates">
            <div className="availability-editor__label">
              <label htmlFor="av-from-year" className="availability-editor__field-label">Från datum</label>
              <DateInput
                id="av-from-year"
                value={av.startDate ?? ""}
                onChange={(v) => patch({ startDate: v || null })}
              />
            </div>
            <div className="availability-editor__label">
              <label htmlFor="av-to-year" className="availability-editor__field-label">Till datum</label>
              <DateInput
                id="av-to-year"
                value={av.endDate ?? ""}
                onChange={(v) => patch({ endDate: v || null })}
              />
            </div>
          </div>

          <p className="availability-editor__hint">
            Lämna datum tomma för att gälla alla dagar.
          </p>

          <div className="availability-editor__windows">
            <p className="availability-editor__intervals-label">Tidsfönster</p>
            {av.windows.length === 0 && (
              <p className="availability-editor__hint">
                Inga tidsfönster = tillgänglig hela dagen, alla dagar.
              </p>
            )}

            {av.windows.map((w, i) => (
              <div key={i} className="availability-editor__window">
                <div className="availability-editor__window-header">
                  <span className="availability-editor__window-label">Fönster {i + 1}</span>
                  <button
                    type="button"
                    className="availability-editor__remove-interval"
                    onClick={() => removeWindow(i)}
                    aria-label={`Ta bort fönster ${i + 1}`}
                  >✕</button>
                </div>

                <div aria-label={`Veckodagar för fönster ${i + 1}`} className="availability-editor__days" role="group">
                  {WEEKDAY_ORDER.map((day) => (
                    <button
                      aria-pressed={w.daysOfWeek.includes(day)}
                      className={
                        "availability-editor__day" +
                        (w.daysOfWeek.includes(day) ? " availability-editor__day--on" : "")
                      }
                      key={day}
                      onClick={() => toggleWindowDay(i, day)}
                      type="button"
                    >
                      {WEEKDAY_SHORT[day]}
                    </button>
                  ))}
                </div>
                {w.daysOfWeek.length === 0 && (
                  <p className="availability-editor__hint">
                    Inga veckodagar valda = alla dagar.
                  </p>
                )}

                <div className="availability-editor__intervals">
                  {w.timeIntervals.map((iv, ii) => (
                    <div key={ii} className="availability-editor__interval-row">
                      <input
                        type="time"
                        step={60}
                        aria-label={`Fönster ${i + 1}, intervall ${ii + 1} starttid`}
                        className="availability-editor__time"
                        value={iv.start}
                        onChange={(e) => updateWindowInterval(i, ii, "start", e.target.value)}
                      />
                      <span className="availability-editor__dash">–</span>
                      <input
                        type="time"
                        step={60}
                        aria-label={`Fönster ${i + 1}, intervall ${ii + 1} sluttid`}
                        className="availability-editor__time"
                        value={iv.end}
                        onChange={(e) => updateWindowInterval(i, ii, "end", e.target.value)}
                      />
                      <button
                        type="button"
                        className="availability-editor__remove-interval"
                        onClick={() => removeWindowInterval(i, ii)}
                        aria-label={`Ta bort tidsintervall ${ii + 1} i fönster ${i + 1}`}
                      >✕</button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="availability-editor__add-interval"
                    onClick={() => addWindowInterval(i)}
                  >
                    + Lägg till tid
                  </button>

                  {w.timeIntervals.length === 0 && (
                    <p className="availability-editor__hint">
                      Ingen tid vald = tillgänglig hela dagen.
                    </p>
                  )}
                </div>
              </div>
            ))}

            <button
              type="button"
              className="availability-editor__add-interval"
              onClick={addWindow}
            >
              + Lägg till tidsfönster
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
