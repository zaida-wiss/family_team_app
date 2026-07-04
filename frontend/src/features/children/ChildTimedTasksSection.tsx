import "./ChildTimedTasksSection.css";
import { useState } from "react";
import { Play, Square } from "lucide-react";
import type { Id, TimedTaskWithBest } from "@shared/types";

type Props = {
  timedTasks: TimedTaskWithBest[];
  timerNow: number;
  onRecordAttempt: (id: Id, durationMs: number) => Promise<{ isNewRecord: boolean }>;
};

function fmtDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Start/stopp-tryck, inte håll-in (Zaidas beslut, S9-spiken) — många tidtagna
// uppgifter (t.ex. "spring ett varv") går inte att göra samtidigt som man håller
// i skärmen. timerNow kommer från ChildDashboard:s redan tickande 1s-intervall,
// ingen egen duplicerad interval här.
export function ChildTimedTasksSection({ timedTasks, timerNow, onRecordAttempt }: Props) {
  const [running, setRunning] = useState<{ id: Id; startedAt: number } | null>(null);

  if (timedTasks.length === 0) return null;

  function toggle(task: TimedTaskWithBest) {
    if (running?.id === task.id) {
      const durationMs = Date.now() - running.startedAt;
      setRunning(null);
      void onRecordAttempt(task.id, durationMs);
      return;
    }
    setRunning({ id: task.id, startedAt: Date.now() });
  }

  return (
    <section className="child-timed-tasks" aria-label="Rekord">
      <h3 className="child-timed-tasks__heading">🏆 Rekord</h3>
      <div className="child-timed-tasks__list">
        {timedTasks.map((task) => {
          const isRunning = running?.id === task.id;
          const elapsed = isRunning ? timerNow - running.startedAt : null;

          return (
            <div className="child-timed-tasks__card" key={task.id}>
              <span className="child-timed-tasks__symbol">{task.symbol ?? "🏃"}</span>
              <div className="child-timed-tasks__info">
                <strong>{task.title}</strong>
                <small>
                  {isRunning
                    ? fmtDuration(elapsed ?? 0)
                    : task.bestDurationMs !== null
                      ? `Bästa: ${fmtDuration(task.bestDurationMs)}`
                      : "Inget rekord än"}
                </small>
              </div>
              <button
                className={`child-timed-tasks__btn${isRunning ? " child-timed-tasks__btn--stop" : ""}`}
                type="button"
                onClick={() => toggle(task)}
                aria-label={isRunning ? `Stoppa tidtagning för ${task.title}` : `Starta tidtagning för ${task.title}`}
              >
                {isRunning ? <Square size={20} /> : <Play size={20} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
