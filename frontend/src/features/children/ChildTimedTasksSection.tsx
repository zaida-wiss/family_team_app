import "./ChildTimedTasksSection.css";
import { useState } from "react";
import { Play, Square, Trophy } from "lucide-react";
import type { Id, TimedTaskWithBest } from "@shared/types";
import type { TimedAttemptListItem } from "../../api/timedTasks";
import { useWakeLock } from "../../hooks/useWakeLock";
import { trackEvent } from "../../utils/analytics";
import { TimedTaskRecordsModal } from "./TimedTaskRecordsModal";

type Props = {
  timedTasks: TimedTaskWithBest[];
  timerNow: number;
  onRecordAttempt: (id: Id, durationMs: number) => Promise<{ isNewRecord: boolean }>;
  onListAttempts: (id: Id) => Promise<TimedAttemptListItem[]>;
  onDeleteAttempt: (id: Id, attemptId: Id) => Promise<void>;
};

// Måste matcha CSS-animationens totala längd (child-timed-tasks-blink i
// .css, 2026-07-13: tre 1s gröna blink med 0,5s paus emellan = 4s totalt).
const FLASH_MS = 4000;
const RUNNING_STORAGE_KEY = "timedTaskRunning";
const THEME_ACCENT_COUNT = 8;

// Samma rotations-princip som ParentTodoThreadView.tsx:s accentColorForIndex
// — varje kort får en egen accentfärg ur det AKTIVA temats --c0…--c7 istället
// för en hårdkodad kulör, TimedTask saknar ett eget kategori-/färgfält.
function accentColorForIndex(index: number): string {
  return `var(--c${index % THEME_ACCENT_COUNT})`;
}

function fmtDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// running lagras som en Map (id → startedAt) i localStorage, inte en enda
// useState-variabel (2026-07-13, Zaidas fynd: "jag behöver kunna starta
// flera tidtagningar samtidigt utan att den föregående stoppas" + "refresha
// eller växla vyer utan att tidtagningen stoppas"). En Map tillåter flera
// samtidiga id:n. localStorage (inte bara React-state) gör att starttiden
// överlever att ChildRecordsPage monteras ner helt (byte av panel,
// sidomladdning) — samma "klienten mäter, ingen server-side pågående-status"-
// princip som redan gäller (se ADR-0018), bara VAR den mellanlagras ändras.
// Ett absolut startAt-tidsstämpel (inte "förfluten tid hittills") gör att
// elapsed alltid räknas rätt mot Date.now() oavsett hur länge sidan var
// omonterad.
function loadRunning(): Map<Id, number> {
  try {
    const raw = window.localStorage.getItem(RUNNING_STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, number>));
  } catch {
    return new Map();
  }
}

function saveRunning(running: Map<Id, number>) {
  window.localStorage.setItem(RUNNING_STORAGE_KEY, JSON.stringify(Object.fromEntries(running)));
}

// Start/stopp-tryck, inte håll-in (Zaidas beslut, S9-spiken) — många tidtagna
// uppgifter (t.ex. "spring ett varv") går inte att göra samtidigt som man håller
// i skärmen. Flyttad till en egen sida (ChildRecordsPage, 2026-07-06, Zaidas
// beslut) — timerNow kommer därför från den sidans egna tickande 1s-intervall.
// Korten fick samma rektangulära grid-form som uppdragskorten (ChildTasks.css)
// och en fullbredds start/stopp-knapp istället för en liten 44px-cirkel
// (2026-07-13, Zaidas fynd: "lika form... rektangulära och lättare att trycka
// på") — egna, enklare CSS-klasser (inte ChildTasks.css:s container-query-
// beroende klasser) eftersom Rekord-sidan saknar Dashboardens fasta
// grid-höjd som cqb/cqh-enheterna förutsätter.
export function ChildTimedTasksSection({
  timedTasks,
  timerNow,
  onRecordAttempt,
  onListAttempts,
  onDeleteAttempt
}: Props) {
  const [running, setRunning] = useState<Map<Id, number>>(() => loadRunning());
  const [flashingId, setFlashingId] = useState<Id | null>(null);
  // Rekord-modalen (2026-07-13) — datum/antal försök per dag, ta bort
  // tider, linjediagram. Enda stället rekord-info visas (Zaidas beslut:
  // "det ska inte stå någonting om rekordet utanför modalen"). Öppnas via
  // medalj-knappen — provades först som en separat penn-ikon, men Zaida
  // ville hellre ha tillbaka medaljen/pokalen som knapp, samma modal bakom.
  const [editingTask, setEditingTask] = useState<TimedTaskWithBest | null>(null);

  useWakeLock(running.size > 0);

  if (timedTasks.length === 0) {
    return <p className="empty-note">Inga rekorduppgifter ännu.</p>;
  }

  function toggle(task: TimedTaskWithBest) {
    const startedAt = running.get(task.id);
    const next = new Map(running);
    if (startedAt !== undefined) {
      const durationMs = Date.now() - startedAt;
      next.delete(task.id);
      setRunning(next);
      saveRunning(next);
      onRecordAttempt(task.id, durationMs).then(({ isNewRecord }) => {
        if (isNewRecord) {
          setFlashingId(task.id);
          window.setTimeout(() => setFlashingId(null), FLASH_MS);
        }
      }).catch(console.error);
      return;
    }
    next.set(task.id, Date.now());
    setRunning(next);
    saveRunning(next);
    trackEvent("timed-task-started");
  }

  return (
    <section className="child-timed-tasks" aria-label="Rekord">
      <div className="child-timed-tasks__grid">
        {timedTasks.map((task, index) => {
          const startedAt = running.get(task.id);
          const isRunning = startedAt !== undefined;
          // Math.max(0, ...) — timerNow tickar bara en gång per sekund
          // (ChildRecordsPage.tsx), så den kan ligga en aning FÖRE det exakta
          // Date.now() man startade på precis efter en tryckning, vilket annars
          // visar en kort, förvirrande negativ tid ("-1:-1") tills nästa tick.
          const elapsed = isRunning ? Math.max(0, timerNow - startedAt) : null;

          return (
            <div key={task.id} className="child-timed-tasks__cell">
              <div
                className={
                  "child-timed-tasks__card" +
                  (isRunning ? " child-timed-tasks__card--running" : "") +
                  (flashingId === task.id ? " child-timed-tasks__card--flash" : "")
                }
                style={{ "--task-accent": accentColorForIndex(index) } as React.CSSProperties}
              >
                <button
                  className="child-timed-tasks__medal"
                  type="button"
                  onClick={() => setEditingTask(task)}
                  aria-label={`Visa rekord för ${task.title}`}
                >
                  <Trophy size={16} />
                </button>
                <div className="child-timed-tasks__icon-circle">
                  <span className="child-timed-tasks__icon">{task.symbol ?? "🏃"}</span>
                </div>
                <span className="child-timed-tasks__copy">
                  <strong className="child-timed-tasks__name">{task.title}</strong>
                  {isRunning && (
                    <small className="child-timed-tasks__status">{fmtDuration(elapsed ?? 0)}</small>
                  )}
                </span>
                <button
                  type="button"
                  className={
                    "child-timed-tasks__toggle-btn" + (isRunning ? " child-timed-tasks__toggle-btn--stop" : "")
                  }
                  onClick={() => toggle(task)}
                  aria-label={isRunning ? `Stoppa tidtagning för ${task.title}` : `Starta tidtagning för ${task.title}`}
                >
                  {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                  {isRunning ? "Klar" : "Starta"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editingTask && (
        <TimedTaskRecordsModal
          task={editingTask}
          onListAttempts={onListAttempts}
          onDeleteAttempt={onDeleteAttempt}
          onClose={() => setEditingTask(null)}
        />
      )}
    </section>
  );
}
