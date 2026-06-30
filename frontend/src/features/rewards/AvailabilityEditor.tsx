import "./AvailabilityEditor.css";
import { useState } from "react";
import type { ShopAvailability, ShopTimeInterval } from "@shared/types";

type Props = {
  value: ShopAvailability | null;
  onChange: (v: ShopAvailability | null) => void;
};

const empty = (): ShopAvailability => ({
  startDate: null,
  endDate: null,
  timeIntervals: [],
});

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

  function addInterval() {
    patch({ timeIntervals: [...av.timeIntervals, { start: "08:00", end: "09:00" }] });
  }

  function updateInterval(i: number, field: keyof ShopTimeInterval, val: string) {
    const updated = av.timeIntervals.map((iv, idx) =>
      idx === i ? { ...iv, [field]: val } : iv
    );
    patch({ timeIntervals: updated });
  }

  function removeInterval(i: number) {
    patch({ timeIntervals: av.timeIntervals.filter((_, idx) => idx !== i) });
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
            <label className="availability-editor__label">
              Från datum
              <input
                type="date"
                className="availability-editor__input"
                value={av.startDate ?? ""}
                onChange={(e) => patch({ startDate: e.target.value || null })}
              />
            </label>
            <label className="availability-editor__label">
              Till datum
              <input
                type="date"
                className="availability-editor__input"
                value={av.endDate ?? ""}
                onChange={(e) => patch({ endDate: e.target.value || null })}
              />
            </label>
          </div>

          <p className="availability-editor__hint">
            Lämna datum tomma för att gälla alla dagar.
          </p>

          <div className="availability-editor__intervals">
            <p className="availability-editor__intervals-label">Tidsintervall</p>
            {av.timeIntervals.map((iv, i) => (
              <div key={i} className="availability-editor__interval-row">
                <input
                  type="time"
                  aria-label={`Intervall ${i + 1} starttid`}
                  className="availability-editor__time"
                  value={iv.start}
                  onChange={(e) => updateInterval(i, "start", e.target.value)}
                />
                <span className="availability-editor__dash">–</span>
                <input
                  type="time"
                  aria-label={`Intervall ${i + 1} sluttid`}
                  className="availability-editor__time"
                  value={iv.end}
                  onChange={(e) => updateInterval(i, "end", e.target.value)}
                />
                <button
                  type="button"
                  className="availability-editor__remove-interval"
                  onClick={() => removeInterval(i)}
                  aria-label={`Ta bort tidsintervall ${i + 1}`}
                >✕</button>
              </div>
            ))}

            <button
              type="button"
              className="availability-editor__add-interval"
              onClick={addInterval}
            >
              + Lägg till tidsintervall
            </button>

            {av.timeIntervals.length === 0 && (
              <p className="availability-editor__hint">
                Inga tidsintervall = tillgänglig hela dagen.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
