import { useEffect, useState } from "react";
import { todosApi } from "../../api";
import { bucketCompletedStatsByDay } from "./selectors";
import "./FamilyCompletedStats.css";

const DAYS = 14;
// 6% golv (~4px av spårets 64px) — ett dygn med minst en avklarad uppgift
// ska alltid synas som en riktig stapel, inte försvinna i avrundningen mot
// en långt högre maxdag (dataviz-skillens "4px rundad datakant"-minimum).
const MIN_VISIBLE_PERCENT = 6;

function shortDayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

// Expanderbar "följ över tid"-statistik i Idag i familjen-kortet (2026-08-15,
// Zaida). Fast 14-dagarsfönster (produktbeslut, se todosApi.getCompletedStats)
// — hämtas lat, bara när kortet faktiskt fälls ut, inte vid varje mount av
// Hem-vyns Todos-flik. Ett enda dataserie (total per dag) → ingen legend
// behövs (dataviz-skillen: en serie förklaras redan av rubriken).
export function FamilyCompletedStats() {
  const [timestamps, setTimestamps] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    todosApi
      .getCompletedStats()
      .then((data) => {
        if (!cancelled) setTimestamps(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="family-completed-stats__empty">Kunde inte hämta statistik just nu.</p>;
  }
  if (timestamps === null) {
    return <p className="family-completed-stats__empty">Laddar…</p>;
  }

  const buckets = bucketCompletedStatsByDay(timestamps, new Date(), DAYS);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <div className="family-completed-stats">
      <p className="family-completed-stats__summary">
        {total} avklarade de senaste {DAYS} dagarna
      </p>
      <ol className="family-completed-stats__bars" aria-label={`Avklarade uppgifter per dag, senaste ${DAYS} dagarna`}>
        {buckets.map((bucket) => {
          const heightPercent = bucket.count === 0 ? 0 : Math.max(MIN_VISIBLE_PERCENT, (bucket.count / max) * 100);
          const label = `${shortDayLabel(bucket.dateStr)}: ${bucket.count} avklarade`;
          return (
            <li className="family-completed-stats__col" key={bucket.dateStr}>
              <div className="family-completed-stats__track">
                <button
                  aria-label={label}
                  className="family-completed-stats__hit"
                  title={label}
                  type="button"
                >
                  <span className="family-completed-stats__bar" style={{ height: `${heightPercent}%` }} />
                </button>
              </div>
              <span aria-hidden="true" className="family-completed-stats__label">
                {shortDayLabel(bucket.dateStr).split(" ")[0]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
