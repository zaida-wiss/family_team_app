import type { CSSProperties } from "react";
import { useState } from "react";
import { Play, Square, Star } from "lucide-react";
import type { Id, Todo } from "@shared/types";
import { useWakeLock } from "../../hooks/useWakeLock";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
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

const HOLD_DURATION_MS = 2000;

export function ChildTasksSection({ todos, today, timerNow, heldTodoId, onStartHold, onClearHold, onCompleteTodo }: Props) {
  // Bara EN uppgift kan tidtas åt gången (samma begränsning som Medaljer/
  // Rekord) — startedAt mäts lokalt (Date.now()), ingen pågående-status
  // sparas server-side, se Todo.elapsedMs-kommentaren i shared/types.ts.
  const [runningTimer, setRunningTimer] = useState<{ id: Id; startedAt: number } | null>(null);
  useWakeLock(runningTimer !== null);

  // Nedräkningsläget (plannedDurationMinutes satt, 2026-07-07 Zaidas
  // förtydligande) avslutas med samma håll-in-2-sekunder-gest som vanliga
  // uppgifter, INTE en Klar-knapp — men med sin egen useHoldToConfirm-instans
  // (inte den delade heldTodoId/onStartHold som styr icke-timer-korten), så
  // att elapsedMs kan räknas ut från runningTimer.startedAt vid bekräftelse-
  // tillfället utan att ändra useChildCompleteHold.ts:s delade kontrakt.
  const { heldId: timerHeldId, startHold: startTimerHold, clearHold: clearTimerHold } = useHoldToConfirm(HOLD_DURATION_MS);

  if (todos.length === 0) {
    return <p className="empty-note">Inga uppgifter idag – bra jobbat!</p>;
  }

  function startTimer(id: Id) {
    setRunningTimer({ id, startedAt: Date.now() });
  }

  // Öppen tidtagning (fallback när plannedDurationMinutes saknas) — Klar-
  // knappen ÄR bekräftelsen, oförändrat sedan tidigare.
  function stopTimer(id: Id) {
    if (!runningTimer || runningTimer.id !== id) return;
    const elapsedMs = Date.now() - runningTimer.startedAt;
    setRunningTimer(null);
    onCompleteTodo(id, elapsedMs);
  }

  // Nedräkning — bekräftas via 2s-håll, inte ett klick. Läser startedAt via
  // funktionell uppdatering så den alltid är färsk, inte en gammal closure.
  function confirmCountdownComplete(id: Id) {
    setRunningTimer((current) => {
      if (current && current.id === id) {
        onCompleteTodo(id, Date.now() - current.startedAt);
      }
      return null;
    });
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

            // Nedräkning (2026-07-07, Zaidas förtydligande: "jag menar en
            // timer, där bordet visar hur lång tid som är kvar efter att man
            // tryckt på knappen med dubbelklick. Sedan markerar man den som
            // klar med två sekunderstryck.") — dubbelklick startar, håll-in-2s
            // avslutar, precis som en vanlig uppgift. Kräver plannedDuration-
            // Minutes (satt av föräldern); saknas den faller kortet tillbaka
            // på den öppna Starta/Klar-tidtagningen (nedan), som Zaida bad få
            // stå kvar ("den får gärna stå kvar").
            if (todo.timerEnabled && todo.plannedDurationMinutes) {
              const isRunning = runningTimer?.id === todo.id;
              const isHeld = timerHeldId === todo.id;
              const totalMs = todo.plannedDurationMinutes * 60000;
              const remainingMs = isRunning ? Math.max(0, totalMs - (timerNow - runningTimer.startedAt)) : totalMs;
              return (
                <div
                  key={todo.id}
                  className={[
                    "child-task-card",
                    "child-task-card--timer",
                    isRunning ? "child-task-card--timer-running" : "",
                    isHeld ? "child-task-card--holding" : "",
                    timeLeftPercent !== null ? "child-task-card--timed" : "",
                  ].filter(Boolean).join(" ")}
                  style={{ ...style, touchAction: "manipulation" }}
                  onDoubleClick={() => !isRunning && startTimer(todo.id)}
                  onPointerDown={() => isRunning && startTimerHold(todo.id, () => confirmCountdownComplete(todo.id))}
                  onPointerLeave={clearTimerHold}
                  onPointerCancel={clearTimerHold}
                  onPointerUp={clearTimerHold}
                  role="button"
                  tabIndex={0}
                  aria-label={
                    isRunning
                      ? `${todo.title}, ${formatElapsed(remainingMs)} kvar. Håll intryckt i två sekunder för att markera klar.`
                      : `${todo.title}. Dubbelklicka för att starta nedräkningen på ${todo.plannedDurationMinutes} minuter.`
                  }
                >
                  <div className="child-task-icon-circle">
                    <span className="child-task-icon">{todo.visual.value}</span>
                  </div>
                  <span className="child-task-copy">
                    <span className={nameClass}>{todo.title}</span>
                    <span className="child-task-timer-elapsed" aria-live="polite">
                      {isRunning ? formatElapsed(remainingMs) + " kvar" : "Dubbelklicka för att starta"}
                    </span>
                  </span>
                  {starBadge}
                </div>
              );
            }

            // Öppen tidtagning (fallback, oförändrad sedan tidigare) — bara
            // för uppgifter med timerEnabled men UTAN plannedDurationMinutes.
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
