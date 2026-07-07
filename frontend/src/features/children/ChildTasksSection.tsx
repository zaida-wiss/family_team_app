import type { CSSProperties } from "react";
import { useState } from "react";
import { Play, Square, Star } from "lucide-react";
import type { Id, Todo } from "@shared/types";
import { useWakeLock } from "../../hooks/useWakeLock";
import "./ChildTasks.css";

// Formaterar millisekunder som mm:ss (eller h:mm:ss om det tar över en timme)
// — samma princip som ChildTimedTasksSection.tsx, duplicerad hellre än att
// skapa ett cross-feature-beroende mellan todos-timern och Medaljer/Rekord
// (helt separata datamodeller, se shared/types.ts Todo.elapsedMs-kommentaren).
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

type TaskCardStyle = CSSProperties & {
  "--task-accent"?: string;
  "--task-bg"?: string;
  "--task-time-fraction"?: number;
};

const KNOWN_CATEGORIES = ["hälsa", "trivsel", "skills", "pengar"] as const;

function getTaskStyle(category: string): TaskCardStyle {
  const norm = category.trim().toLocaleLowerCase("sv-SE");
  const key =
    KNOWN_CATEGORIES.find((k) => norm.includes(k)) ??
    KNOWN_CATEGORIES[[...norm].reduce((s, c) => s + c.charCodeAt(0), 0) % KNOWN_CATEGORIES.length];
  return { "--task-accent": `var(--cat-${key}-accent)`, "--task-bg": `var(--cat-${key}-bg)` };
}

function getTimeLeftPercent(todo: Todo, now: number): number | null {
  if (!todo.visibleFrom || !todo.expiresAt) return null;
  const startsAt = new Date(todo.visibleFrom).getTime();
  const endsAt = new Date(todo.expiresAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  return Math.max(0, Math.min(100, ((endsAt - now) / (endsAt - startsAt)) * 100));
}

function getTodayHeading(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { weekday: "long" }).format(date);
}

type Props = {
  todos: Todo[];
  today: Date;
  timerNow: number;
  heldTodoId: Id | null;
  onStartHold: (id: Id) => void;
  onClearHold: () => void;
  // Timerfunktion (2026-07-07, Zaidas önskemål) — separat väg förbi
  // håll-in-bekräftelsen: att trycka Klar på en pågående tidtagning ÄR
  // bekräftelsen, ingen ytterligare 2s-håll behövs ovanpå det.
  onCompleteTodo: (id: Id, elapsedMs: number | null) => void;
};

export function ChildTasksSection({ todos, today, timerNow, heldTodoId, onStartHold, onClearHold, onCompleteTodo }: Props) {
  // Bara EN uppgift kan tidtas åt gången (samma begränsning som Medaljer/
  // Rekord) — startedAt mäts lokalt (Date.now()), ingen pågående-status
  // sparas server-side, se Todo.elapsedMs-kommentaren i shared/types.ts.
  const [runningTimer, setRunningTimer] = useState<{ id: Id; startedAt: number } | null>(null);
  useWakeLock(runningTimer !== null);

  if (todos.length === 0) {
    return <p className="empty-note">Inga uppgifter idag – bra jobbat!</p>;
  }

  function startTimer(id: Id) {
    setRunningTimer({ id, startedAt: Date.now() });
  }

  function stopTimer(id: Id) {
    if (!runningTimer || runningTimer.id !== id) return;
    const elapsedMs = Date.now() - runningTimer.startedAt;
    setRunningTimer(null);
    onCompleteTodo(id, elapsedMs);
  }

  return (
    <section className="child-tasks-section" aria-label="Uppgifter idag">
      <div className="child-tasks-head">
        <h3 className="child-tasks-heading">Dina uppgifter idag</h3>
        <span>{getTodayHeading(today)}</span>
      </div>
      <div className="child-tasks-grid">
        {todos
          .map((todo, i) => {
            const category = todo.routineCategory ?? "";
            const timeLeftPercent = getTimeLeftPercent(todo, timerNow);
            const style: TaskCardStyle = {
              animationDelay: `${i * 80}ms`,
              ...getTaskStyle(category),
              ...(timeLeftPercent === null ? {} : { "--task-time-fraction": timeLeftPercent / 100 }),
            };
            const nameClass = `child-task-name${todo.title.length > 30 ? " child-task-name--long" : todo.title.length > 18 ? " child-task-name--medium" : ""}`;
            const starBadge = (
              <span className="child-task-star-badge">
                {Array.from({ length: Math.min(todo.starValue, 10) }, (_, j) => (
                  <Star key={j} size={12} fill="currentColor" />
                ))}
              </span>
            );

            if (todo.timerEnabled) {
              const isRunning = runningTimer?.id === todo.id;
              return (
                <div
                  key={todo.id}
                  className={[
                    "child-task-card",
                    "child-task-card--timer",
                    isRunning ? "child-task-card--timer-running" : "",
                    timeLeftPercent !== null ? "child-task-card--timed" : "",
                  ].filter(Boolean).join(" ")}
                  style={style}
                >
                  <div className="child-task-icon-circle">
                    <span className="child-task-icon">{todo.visual.value}</span>
                  </div>
                  <span className="child-task-copy">
                    <span className={nameClass}>{todo.title}</span>
                    {isRunning && (
                      <span className="child-task-timer-elapsed" aria-live="polite">
                        {formatElapsed(timerNow - runningTimer.startedAt)}
                      </span>
                    )}
                  </span>
                  {starBadge}
                  <button
                    aria-label={isRunning ? `Klar med ${todo.title}` : `Starta ${todo.title}`}
                    className={"child-task-timer-btn" + (isRunning ? " child-task-timer-btn--stop" : "")}
                    onClick={() => (isRunning ? stopTimer(todo.id) : startTimer(todo.id))}
                    type="button"
                  >
                    {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                    {isRunning ? "Klar" : "Starta"}
                  </button>
                </div>
              );
            }

            return (
              <button
                key={todo.id}
                className={[
                  "child-task-card",
                  heldTodoId === todo.id ? "child-task-card--holding" : "",
                  timeLeftPercent !== null ? "child-task-card--timed" : "",
                ].filter(Boolean).join(" ")}
                style={style}
                onPointerDown={() => onStartHold(todo.id)}
                onPointerLeave={onClearHold}
                onPointerCancel={onClearHold}
                onPointerUp={onClearHold}
                type="button"
              >
                <div className="child-task-icon-circle">
                  <span className="child-task-icon">{todo.visual.value}</span>
                </div>
                <span className="child-task-copy">
                  <span className={nameClass}>
                    {todo.title}
                  </span>
                </span>
                {starBadge}
              </button>
            );
          })}
      </div>
    </section>
  );
}
