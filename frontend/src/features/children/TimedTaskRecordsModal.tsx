import "./TimedTaskRecordsModal.css";
import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import type { Id, TimedTaskWithBest } from "@shared/types";
import type { TimedAttemptListItem } from "../../api/timedTasks";
import { useModalA11y } from "../../hooks/useModalA11y";

type Props = {
  task: TimedTaskWithBest;
  onListAttempts: (id: Id) => Promise<TimedAttemptListItem[]>;
  onDeleteAttempt: (id: Id, attemptId: Id) => Promise<void>;
  onClose: () => void;
};

function fmtDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function fmtDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}

// Nyckel för att gruppera per KALENDERDAG, inte per 24h-fönster (samma
// lokala-datum-princip som isoToDateOnly i todoCsv.ts — en rå ISO-slice
// läser UTC-datumet och kan hamna en dag fel beroende på tidszon).
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type DayGroup = {
  key: string;
  label: string;
  attempts: TimedAttemptListItem[];
};

function groupByDay(attempts: TimedAttemptListItem[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const attempt of attempts) {
    const key = dayKey(attempt.achievedAt);
    const existing = groups.get(key);
    if (existing) {
      existing.attempts.push(attempt);
    } else {
      groups.set(key, { key, label: fmtDayLabel(attempt.achievedAt), attempts: [attempt] });
    }
  }
  // attempts kommer redan senast-först från backend (sort achievedAt: -1) —
  // gruppernas egen ordning bevaras då automatiskt (Map behåller
  // insättningsordning), ingen extra sortering behövs.
  return [...groups.values()];
}

// Redigera-modalen (2026-07-13, penna-knappen på tävlingskorten): datum +
// antal försök per dag, radera enskilda tider, och ett litet linjediagram
// över utvecklingen (se dataviz-skillen — enda serie, ingen legend/palett-
// validering behövs, EN kulör räcker: var(--c1), samma som resten av
// tävlingskortens accentfärg). Den vanliga listan nedanför fungerar redan
// som chartens "tabellvy" (datum+tid finns där i klartext) — ingen separat
// tabell behövde byggas.
export function TimedTaskRecordsModal({ task, onListAttempts, onDeleteAttempt, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [attempts, setAttempts] = useState<TimedAttemptListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [deletingId, setDeletingId] = useState<Id | null>(null);

  useEffect(() => {
    onListAttempts(task.id).then(setAttempts).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function handleDelete(attemptId: Id) {
    setDeletingId(attemptId);
    try {
      await onDeleteAttempt(task.id, attemptId);
      setAttempts((current) => current?.filter((a) => a.id !== attemptId) ?? current);
      setSelectedId((current) => (current === attemptId ? null : current));
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  const groups = attempts ? groupByDay(attempts) : [];
  // Kronologisk ordning (äldst först) för linjediagrammet — motsatt av
  // listans senast-först, en tidslinje ska läsas vänster→höger.
  const chronological = attempts
    ? [...attempts].sort((a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime())
    : [];

  return (
    <div className="timed-task-records-overlay" onClick={onClose}>
      <div
        className="timed-task-records-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timed-task-records-title"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
      >
        <div className="timed-task-records-modal__hdr">
          <span id="timed-task-records-title">
            {task.symbol ? `${task.symbol} ` : ""}
            {task.title}
          </span>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {attempts === null ? (
          <p className="empty-note">Laddar…</p>
        ) : attempts.length === 0 ? (
          <p className="empty-note">Inga försök ännu.</p>
        ) : (
          <>
            <TimedTaskChart attempts={chronological} selectedId={selectedId} onSelect={setSelectedId} />

            <div className="timed-task-records-modal__list">
              {groups.map((group) => (
                <div key={group.key} className="timed-task-records-modal__day">
                  <h4>
                    {group.label} <span>({group.attempts.length} försök)</span>
                  </h4>
                  <ul>
                    {group.attempts.map((attempt) => (
                      <li
                        key={attempt.id}
                        className={selectedId === attempt.id ? "timed-task-records-modal__row--selected" : ""}
                      >
                        <span className="timed-task-records-modal__time">{fmtTime(attempt.achievedAt)}</span>
                        <span className="timed-task-records-modal__duration">
                          {fmtDuration(attempt.durationMs)}
                        </span>
                        <button
                          aria-label={`Ta bort försöket klockan ${fmtTime(attempt.achievedAt)}`}
                          className="icon-button danger"
                          disabled={deletingId === attempt.id}
                          onClick={() => handleDelete(attempt.id)}
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type ChartProps = {
  attempts: TimedAttemptListItem[];
  selectedId: Id | null;
  onSelect: (id: Id) => void;
};

const CHART_WIDTH = 300;
const CHART_HEIGHT = 120;
const CHART_PAD_LEFT = 34;
const CHART_PAD_RIGHT = 12;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 8;

// Enkelt, beroendefritt SVG-linjediagram (ingen ny charting-dependency för
// en enda serie i en modal, se CLAUDE.md:s regel om motiverade beroenden).
// Formspec (dataviz-skillen): 2px linje, ≥8px punktmarkörer med 2px
// ytring, hairline-rutnät, endast slutpunkten direkt-etiketterad.
function TimedTaskChart({ attempts, selectedId, onSelect }: ChartProps) {
  if (attempts.length < 2) {
    return (
      <p className="timed-task-records-modal__chart-hint">
        Minst två försök behövs för att visa ett diagram.
      </p>
    );
  }

  const durations = attempts.map((a) => a.durationMs);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  // Platt linje (alla lika snabba) — undvik division med noll, ge en liten
  // konstgjord marginal så linjen inte ligger exakt på kanten.
  const range = max - min || 1;
  const plotWidth = CHART_WIDTH - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM;

  function xFor(index: number): number {
    return attempts.length === 1
      ? CHART_PAD_LEFT + plotWidth / 2
      : CHART_PAD_LEFT + (index / (attempts.length - 1)) * plotWidth;
  }
  function yFor(durationMs: number): number {
    return CHART_PAD_TOP + plotHeight - ((durationMs - min) / range) * plotHeight;
  }

  const points = attempts.map((a, i) => ({ x: xFor(i), y: yFor(a.durationMs), attempt: a }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const selected = attempts.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="timed-task-records-modal__chart">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`Linjediagram över tiderna, från ${fmtDuration(min)} till ${fmtDuration(max)}`}
      >
        {/* Rutnät (hairline, recessivt) — max/min-linjer */}
        <line
          x1={CHART_PAD_LEFT} x2={CHART_WIDTH - CHART_PAD_RIGHT}
          y1={CHART_PAD_TOP} y2={CHART_PAD_TOP}
          className="timed-task-records-modal__chart-grid"
        />
        <line
          x1={CHART_PAD_LEFT} x2={CHART_WIDTH - CHART_PAD_RIGHT}
          y1={CHART_HEIGHT - CHART_PAD_BOTTOM} y2={CHART_HEIGHT - CHART_PAD_BOTTOM}
          className="timed-task-records-modal__chart-grid"
        />
        <text x={2} y={CHART_PAD_TOP + 3} className="timed-task-records-modal__chart-axis">
          {fmtDuration(max)}
        </text>
        <text x={2} y={CHART_HEIGHT - CHART_PAD_BOTTOM + 3} className="timed-task-records-modal__chart-axis">
          {fmtDuration(min)}
        </text>

        <path d={path} className="timed-task-records-modal__chart-line" fill="none" />

        {points.map((p, i) => (
          <g key={p.attempt.id}>
            {/* Osynlig, större hit-yta (≥8px synlig punkt, men träffytan större för touch) */}
            <circle
              cx={p.x} cy={p.y} r={10}
              className="timed-task-records-modal__chart-hit"
              onClick={() => onSelect(p.attempt.id)}
              role="button"
              tabIndex={0}
              aria-label={`${fmtDayLabel(p.attempt.achievedAt)} klockan ${fmtTime(p.attempt.achievedAt)}, ${fmtDuration(p.attempt.durationMs)}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(p.attempt.id);
                }
              }}
            />
            <circle
              cx={p.x} cy={p.y}
              r={selectedId === p.attempt.id ? 6 : 4.5}
              className="timed-task-records-modal__chart-dot"
              aria-hidden="true"
            />
            {i === points.length - 1 && (
              <text
                x={Math.min(p.x, CHART_WIDTH - CHART_PAD_RIGHT - 4)}
                y={p.y - 10}
                textAnchor="end"
                className="timed-task-records-modal__chart-end-label"
              >
                {fmtDuration(last.attempt.durationMs)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="timed-task-records-modal__chart-caption" aria-live="polite">
        {selected
          ? `${fmtDayLabel(selected.achievedAt)} kl. ${fmtTime(selected.achievedAt)}: ${fmtDuration(selected.durationMs)}`
          : "Tryck på en punkt för att se datum och tid."}
      </p>
    </div>
  );
}
