import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";
import { Play, Square, Star } from "lucide-react";
import type { Id, Todo, TodoCategory } from "@shared/types";
import { useWakeLock } from "../../hooks/useWakeLock";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { readTodoTimerStartedAt, timerCapMinutes, useTodoTimer } from "../todos/useTodoTimer";
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
  // Kontobreda kategorier (2026-07-08, ADR-0020 — ersätter routineCategory)
  // — används bara för att härleda kortets accentfärg via personalCategoryId.
  categories: TodoCategory[];
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
// Tre snabba tryck startar timern (2026-08-08, Zaidas önskemål: "tidtagning
// skall starta om man trycker 3 snabba tryck på uppgiften i både barnvy och
// vuxenvy") — samma tidsfönster som vuxenvyns motsvarande gest
// (ParentTodoThreadView.tsx/FamilyTodoThreads.tsx).
const TRIPLE_TAP_MS = 300;

export function ChildTasksSection({ todos, categories, today, timerNow, heldTodoId, onStartHold, onClearHold, onCompleteTodo }: Props) {
  if (todos.length === 0) {
    return <p className="empty-note">Inga uppgifter idag – bra jobbat!</p>;
  }

  return (
    <section className="child-tasks-section" aria-label="Uppgifter idag">
      <div className="child-tasks-head">
        <h3 className="child-tasks-heading">Dina uppgifter idag</h3>
        <span>{getTodayHeading(today)}</span>
      </div>
      <div className="child-tasks-grid">
        {todos.map((todo, i) => {
          const category = categories.find((c) => c.id === todo.personalCategoryId)?.name ?? "";
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
            return (
              <ChildTimerTaskCard
                key={todo.id}
                nameClass={nameClass}
                onCompleteTodo={onCompleteTodo}
                starBadge={starBadge}
                style={style}
                timeLeftPercent={timeLeftPercent}
                timerNow={timerNow}
                todo={todo}
              />
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

type ChildTimerTaskCardProps = {
  todo: Todo;
  style: TaskCardStyle;
  nameClass: string;
  starBadge: ReactNode;
  timeLeftPercent: number | null;
  timerNow: number;
  onCompleteTodo: (id: Id, elapsedMs: number | null) => void;
};

// Egen komponent PER uppgift (2026-08-08) — krävs för att useTodoTimer (en
// hook) ska kunna anropas en gång per todo-id utan att bryta mot Hooks-
// reglerna (kan inte anropas villkorligt/dynamiskt inne i en .map()-closure
// i förälderkomponenten). Samtidigt bytet från lokal, förlorad-vid-
// ommontering React-state (det gamla runningTimer i ChildTasksSection) till
// den delade, localStorage-backade useTodoTimer-hooken — "timern får inte
// avbrytas när man växlar mellan sidor" (Zaidas önskemål), och flera
// uppgifters timers kan nu gå SAMTIDIGT (ingen "bara en åt gången"-spärr
// längre, samma princip som vuxenvyn: "startar andra timers" ska inte
// avbryta en redan pågående).
function ChildTimerTaskCard({ todo, style, nameClass, starBadge, timeLeftPercent, timerNow, onCompleteTodo }: ChildTimerTaskCardProps) {
  const { startedAt, start, clear } = useTodoTimer(todo.id, timerCapMinutes(todo));
  useWakeLock(startedAt !== null);

  // Nedräkningsläget avslutas med samma håll-in-2-sekunder-gest som vanliga
  // uppgifter, INTE en Klar-knapp — egen useHoldToConfirm-instans (inte den
  // delade heldTodoId/onStartHold som styr icke-timer-korten).
  const { heldId: timerHeldId, startHold: startTimerHold, clearHold: clearTimerHold } = useHoldToConfirm(HOLD_DURATION_MS);

  // Tryck-räknare för "tre snabba tryck startar timern" — samma mönster som
  // ParentTodoThreadView.tsx/FamilyTodoThreads.tsx. suppressClickRef
  // förhindrar att det klick som naturligt följer en lyckad håll-in-
  // bekräftelse (pointerdown+pointerup på samma element) räknas som ett
  // vanligt tryck.
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);

  function registerTap() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    tapCountRef.current += 1;
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      tapTimerRef.current = null;
      start();
      return;
    }
    tapTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
      tapTimerRef.current = null;
    }, TRIPLE_TAP_MS);
  }

  // Läser av startedAt DIREKT från localStorage vid bekräftelsetillfället
  // (inte från hookens React-state, som annars kan vara ett render bakom —
  // samma "läs alltid färskt vid confirm"-princip som vuxenvyns
  // handleConfirmComplete) — gäller BÅDA nedräkning (2s-håll) och öppen
  // tidtagning ("Klar"-knapp).
  function handleConfirmComplete() {
    const at = readTodoTimerStartedAt(todo.id, timerCapMinutes(todo));
    clear();
    onCompleteTodo(todo.id, at !== null ? Date.now() - at : null);
  }

  const isRunning = startedAt !== null;
  const isCountdown = Boolean(todo.plannedDurationMinutes);

  if (isCountdown) {
    const isHeld = timerHeldId === todo.id;
    const totalMs = (todo.plannedDurationMinutes as number) * 60000;
    // Golvat på 0 (2026-08-08, Zaidas önskemål: "Timern skall inte starta på
    // minus") — timerNow (förälderns 1s-tickande klocka) kan ligga strax
    // FÖRE startedAt (satt till Date.now() exakt vid start) tills nästa tick
    // hinner ikapp.
    const elapsedMs = isRunning ? Math.max(0, timerNow - startedAt) : 0;
    const remainingMs = isRunning ? Math.max(0, totalMs - elapsedMs) : totalMs;
    return (
      <div
        className={[
          "child-task-card",
          "child-task-card--timer",
          isRunning ? "child-task-card--timer-running" : "",
          isHeld ? "child-task-card--holding" : "",
          timeLeftPercent !== null ? "child-task-card--timed" : "",
        ].filter(Boolean).join(" ")}
        style={{ ...style, touchAction: "manipulation" }}
        onClick={() => !isRunning && registerTap()}
        onPointerDown={() => {
          if (!isRunning) return;
          startTimerHold(todo.id, () => {
            suppressClickRef.current = true;
            handleConfirmComplete();
          });
        }}
        onPointerLeave={clearTimerHold}
        onPointerCancel={clearTimerHold}
        onPointerUp={clearTimerHold}
        role="button"
        tabIndex={0}
        aria-label={
          isRunning
            ? `${todo.title}, ${formatElapsed(remainingMs)} kvar. Håll intryckt i två sekunder för att markera klar.`
            : `${todo.title}. Tre snabba tryck startar nedräkningen på ${todo.plannedDurationMinutes} minuter.`
        }
      >
        <div className="child-task-icon-circle">
          <span className="child-task-icon">{todo.visual.value}</span>
        </div>
        <span className="child-task-copy">
          <span className={nameClass}>{todo.title}</span>
        </span>
        {starBadge}
        {isRunning && (
          <span aria-live="polite" className="child-task-timer-digital">
            {formatElapsed(remainingMs)}
          </span>
        )}
      </div>
    );
  }

  // Öppen tidtagning (fallback, oförändrad sedan tidigare) — för uppgifter
  // med timerEnabled men UTAN plannedDurationMinutes. Avslutas med samma
  // Klar-knapp som tidigare (bekräftelsen ÄR knapptrycket), startas nu med
  // antingen tre snabba tryck på kortet eller Starta-knappen.
  return (
    <div
      className={[
        "child-task-card",
        "child-task-card--timer",
        isRunning ? "child-task-card--timer-running" : "",
        timeLeftPercent !== null ? "child-task-card--timed" : "",
      ].filter(Boolean).join(" ")}
      style={style}
      onClick={() => !isRunning && registerTap()}
    >
      <div className="child-task-icon-circle">
        <span className="child-task-icon">{todo.visual.value}</span>
      </div>
      <span className="child-task-copy">
        <span className={nameClass}>{todo.title}</span>
      </span>
      {starBadge}
      {isRunning && (
        <span aria-live="polite" className="child-task-timer-digital">
          {formatElapsed(Math.max(0, timerNow - startedAt))}
        </span>
      )}
      <button
        aria-label={isRunning ? `Klar med ${todo.title}` : `Starta ${todo.title}`}
        className={"child-task-timer-btn" + (isRunning ? " child-task-timer-btn--stop" : "")}
        onClick={(e) => {
          e.stopPropagation();
          if (isRunning) {
            handleConfirmComplete();
          } else {
            start();
          }
        }}
        type="button"
      >
        {isRunning ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        {isRunning ? "Klar" : "Starta"}
      </button>
    </div>
  );
}
