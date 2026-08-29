import "./PurchaseLimitEditor.css";
import { useState } from "react";
import type { PurchaseLimit, PurchaseLimitPeriod } from "@shared/types";

type Props = {
  value: PurchaseLimit | null;
  onChange: (v: PurchaseLimit | null) => void;
};

const PERIOD_OPTIONS: { value: PurchaseLimitPeriod; label: string }[] = [
  { value: "day", label: "per dag" },
  { value: "week", label: "per vecka" },
  { value: "month", label: "per månad" },
];

// Begränsar hur många gånger en vara kan köpas per barn inom en period
// (2026-08-29, Zaidas önskemål) — samma toggle+body-mönster som AvailabilityEditor.
// Räknas per barn, enforceras server-side vid köp, se
// backend/src/services/rewardShopService.ts.
export function PurchaseLimitEditor({ value, onChange }: Props) {
  const [open, setOpen] = useState(value !== null);

  function toggle() {
    if (open) {
      onChange(null);
      setOpen(false);
    } else {
      onChange({ max: 1, period: "day" });
      setOpen(true);
    }
  }

  return (
    <div className="purchase-limit-editor">
      <button
        type="button"
        className="purchase-limit-editor__toggle"
        onClick={toggle}
        aria-expanded={open}
      >
        {open ? "✕ Ta bort köpgräns" : "+ Begränsa antal köp"}
      </button>

      {open && value && (
        <div className="purchase-limit-editor__body">
          <label className="purchase-limit-editor__field">
            Max antal
            <input
              type="number"
              min={1}
              max={99}
              value={value.max}
              onChange={(e) => onChange({ ...value, max: Number(e.target.value) })}
            />
          </label>
          <label className="purchase-limit-editor__field">
            Period
            <select
              value={value.period}
              onChange={(e) => onChange({ ...value, period: e.target.value as PurchaseLimitPeriod })}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
