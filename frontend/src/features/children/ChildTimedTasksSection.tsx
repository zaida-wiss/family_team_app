import "./ChildTimedTasksSection.css";
import { useState } from "react";
import { Play, Square, Trophy } from "lucide-react";
import type { Id, TimedTaskWithBest } from "@shared/types";
import { useWakeLock } from "../../hooks/useWakeLock";
import { trackEvent } from "../../utils/analytics";

type Props = {
  timedTasks: TimedTaskWithBest[];
  timerNow: number;
  onRecordAttempt: (id: Id, durationMs: number) => Promise<{ isNewRecord: boolean }>;
};

const FLASH_MS = 650;

function fmtDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Start/stopp-tryck, inte håll-in (Zaidas beslut, S9-spiken) — många tidtagna
// uppgifter (t.ex. "spring ett varv") går inte att göra samtidigt som man håller
// i skärmen. timerNow kommer från ChildDashboard:s redan tickande 1s-intervall,
// ingen egen duplicerad interval här.
export function ChildTimedTasksSection({ timedTasks, timerNow, onRecordAttempt }: Props) {
  const [running, setRunning] = useState<{ id: Id; startedAt: number } | null>(null);
  const [flashingId, setFlashingId] = useState<Id | null>(null);
  const [expandedId, setExpandedId] = useState<Id | null>(null);

  useWakeLock(running !== null);

  if (timedTasks.length === 0) return null;

  function toggle(task: TimedTaskWithBest) {
    if (running?.id === task.id) {
      const durationMs = Date.now() - running.startedAt;
      setRunning(null);
      onRecordAttempt(task.id, durationMs).then(({ isNewRecord }) => {
        if (isNewRecord) {
          setFlashingId(task.id);
          window.setTimeout(() => setFlashingId(null), FLASH_MS);
        }
      }).catch(console.error);
      return;
    }
    setRunning({ id: task.id, startedAt: Date.now() });
    trackEvent("timed-task-started");
  }

  return (
    <section className="child-timed-tasks" aria-label="Rekord">
      <h3 className="child-timed-tasks__heading">🏆 Rekord</h3>
      <div className="child-timed-tasks__list">
        {timedTasks.map((task) => {
          const isRunning = running?.id === task.id;
          const elapsed = isRunning ? timerNow - running.startedAt : null;
          const hasRecord = task.bestDurationMs !== null;
          const isExpanded = expandedId === task.id;

          return (
            <div key={task.id}>
              <div className={`child-timed-tasks__card${flashingId === task.id ? " child-timed-tasks__card--flash" : ""}`}>
                <span className="child-timed-tasks__symbol">{task.symbol ?? "🏃"}</span>
                <div className="child-timed-tasks__info">
                  <strong>{task.title}</strong>
                  <small>
                    {isRunning
                      ? fmtDuration(elapsed ?? 0)
                      : hasRecord
                        ? `Bästa: ${fmtDuration(task.bestDurationMs!)}`
                        : "Inget rekord än"}
                  </small>
                </div>
                {hasRecord && !isRunning && (
                  <button
                    className="child-timed-tasks__medal"
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                    aria-label={`Visa rekorddetaljer för ${task.title}`}
                    aria-expanded={isExpanded}
                  >
                    <Trophy size={20} />
                  </button>
                )}
                <button
                  className={`child-timed-tasks__btn${isRunning ? " child-timed-tasks__btn--stop" : ""}`}
                  type="button"
                  onClick={() => toggle(task)}
                  aria-label={isRunning ? `Stoppa tidtagning för ${task.title}` : `Starta tidtagning för ${task.title}`}
                >
                  {isRunning ? <Square size={20} /> : <Play size={20} />}
                </button>
              </div>
              {isExpanded && hasRecord && (
                <div className="child-timed-tasks__detail">
                  <span>🗓 Rekord satt: {fmtDate(task.bestAchievedAt!)}</span>
                  <span>⏱ Tid: {fmtDuration(task.bestDurationMs!)}</span>
                  <span>🔁 Antal försök: {task.attemptCount}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
