import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { Id, Todo, TodoCategory } from "@shared/types";
import { useWakeLock } from "../../hooks/useWakeLock";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { readTodoTimerElapsedMs, timerCapMinutes, useTodoTimer } from "../todos/useTodoTimer";
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
  // Bekräftelsekort för en avklarad ÖPPEN tidtagning (2026-08-10, Zaidas
  // önskemål: "vill jag se tiden den stannat på... innan den försvinner
  // efter 3 sekunder", sedan rättat samma dag: "det ska inte blinka grönt...
  // kortet kan skaka/vibrera lite istället. Grönt ska det bara blinka om det
  // är rekord" — grönt är reserverat för RecordCelebration.tsx:s
  // skärmtäckande pokal-firande, se useTodosState.ts:s isNewRecord-hantering,
  // helt separat från det här) — kortet måste leva kvar HÄR, lokalt, i tre
  // sekunder EFTER att uppgiften redan lämnat `todos`-propen (statusen har
  // redan bytts av onCompleteTodo, förälderns filter tar bort den ur listan
  // nästa render) — annars hade kortet bara försvunnit direkt utan att
  // skaket hunnit synas. Nedräkningar (todo.plannedDurationMinutes) hanteras
  // INTE här, se handleConfirmComplete — de försvinner direkt (Zaidas
  // beslut: "då ska uppdragskortet försvinna").
  const [confirmFlashes, setConfirmFlashes] = useState<Record<Id, { todo: Todo; elapsedMs: number | null }>>({});
  const flashTimeoutsRef = useRef<Map<Id, ReturnType<typeof window.setTimeout>>>(new Map());

  useEffect(() => {
    const timeouts = flashTimeoutsRef.current;
    return () => {
      timeouts.forEach((t) => window.clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  function handleConfirmComplete(todo: Todo, elapsedMs: number | null) {
    onCompleteTodo(todo.id, elapsedMs);
    if (todo.plannedDurationMinutes) return;
    setConfirmFlashes((prev) => ({ ...prev, [todo.id]: { todo, elapsedMs } }));
    const existing = flashTimeoutsRef.current.get(todo.id);
    if (existing) window.clearTimeout(existing);
    flashTimeoutsRef.current.set(
      todo.id,
      window.setTimeout(() => {
        flashTimeoutsRef.current.delete(todo.id);
        setConfirmFlashes((prev) => {
          if (!(todo.id in prev)) return prev;
          const next = { ...prev };
          delete next[todo.id];
          return next;
        });
      }, 3000)
    );
  }

  // Flashande kort vars uppgift redan hunnit lämna `todos`-propen (det
  // normala fallet — förälderns filter tar bort den så fort statusen
  // ändras) läggs på i slutet, så en fortfarande-synlig uppgift aldrig
  // dubbelräknas.
  const flashExtras = Object.values(confirmFlashes)
    .map((f) => f.todo)
    .filter((t) => !todos.some((x) => x.id === t.id));
  const renderTodos = flashExtras.length === 0 ? todos : [...todos, ...flashExtras];

  if (renderTodos.length === 0) {
    return <p className="empty-note">Inga uppgifter idag – bra jobbat!</p>;
  }

  return (
    <section className="child-tasks-section" aria-label="Uppgifter idag">
      <div className="child-tasks-head">
        <h3 className="child-tasks-heading">Dina uppgifter idag</h3>
        <span>{getTodayHeading(today)}</span>
      </div>
      <div className="child-tasks-grid">
        {renderTodos.map((todo, i) => {
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

          const flash = confirmFlashes[todo.id];
          if (flash) {
            return (
              <ChildTaskConfirmFlash
                key={todo.id}
                elapsedMs={flash.elapsedMs}
                nameClass={nameClass}
                starBadge={starBadge}
                style={style}
                todo={todo}
              />
            );
          }

          if (todo.timerEnabled) {
            return (
              <ChildTimerTaskCard
                key={todo.id}
                nameClass={nameClass}
                onConfirmComplete={handleConfirmComplete}
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
  // Skickar med hela todon (inte bara id, se onCompleteTodo ovan) — förälder
  // (ChildTasksSection) behöver titel/plannedDurationMinutes för att avgöra
  // om en bekräftelseflash ska visas (2026-08-10).
  onConfirmComplete: (todo: Todo, elapsedMs: number | null) => void;
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
function ChildTimerTaskCard({ todo, style, nameClass, starBadge, timeLeftPercent, timerNow, onConfirmComplete }: ChildTimerTaskCardProps) {
  const { startedAt, accumulatedMs, isPaused, isActive, start, clear, togglePause } = useTodoTimer(todo.id, timerCapMinutes(todo));
  const isRunning = startedAt !== null;
  useWakeLock(isRunning);

  // Nedräkningsläget avslutas med samma håll-in-2-sekunder-gest som vanliga
  // uppgifter, INTE en Klar-knapp — egen useHoldToConfirm-instans (inte den
  // delade heldTodoId/onStartHold som styr icke-timer-korten).
  const { heldId: timerHeldId, startHold: startTimerHold, clearHold: clearTimerHold } = useHoldToConfirm(HOLD_DURATION_MS);

  // Tryck-räknare för "tre snabba tryck nollställer/startar", "ett tryck
  // pausar/återupptar" (2026-08-09, Zaidas önskemål: "ett snabbt tryck
  // stoppar tiden") — samma DOUBLE_TAP_MS-fönster-princip som
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
      // Nollställ, inte en toggle (2026-08-08, Zaidas andra rättelse: "när
      // jag menar 'nollställ' så menar jag så som det var i inställningarna
      // innan man tryckte... en nollställning [ska] föra så att den går
      // tillbaka till just 2 min [för en nedräkning]... är det en tidtagning
      // så skall den börja om från 0") — start() skriver alltid en NY
      // starttid utan ackumulerad tid, vilket redan ger exakt detta,
      // oavsett om timern innan var igång, pausad eller aldrig startad.
      start();
      return;
    }
    // Ett ENSAMT tryck (räknaren hinner nollställas av timeouten utan att nå
    // 2 eller 3) pausar/återupptar — men bara om timern faktiskt är aktiv;
    // en aldrig startad timer gör ingenting av ett enda tryck (samma som
    // innan, "tre snabba tryck startar" är den enda vägen att börja). TVÅ
    // snabba tryck (2026-08-09, Zaidas önskemål: "skall stoppa timern och ta
    // bort aktiveringen för tidtagningen till när man har bättre tid att
    // göra uppgiften") nollställer HELT (samma clear() som modalens
    // Nollställ-knapp) — till skillnad från ett tryck (pausar, BEVARAR
    // tiden) kastas den förflutna tiden bort permanent här.
    const countAtTimeout = tapCountRef.current;
    tapTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
      tapTimerRef.current = null;
      if (countAtTimeout === 1 && isActive) togglePause();
      else if (countAtTimeout === 2 && isActive) clear();
    }, TRIPLE_TAP_MS);
  }

  // Läser av den TOTALA förflutna tiden (ackumulerad + ev. nu körande
  // period) DIREKT från localStorage vid bekräftelsetillfället, inte från
  // hookens React-state som kan vara ett render bakom — samma "läs alltid
  // färskt vid confirm"-princip som vuxenvyns handleConfirmComplete.
  // readTodoTimerElapsedMs returnerar null om timern aldrig startats, vilket
  // onConfirmComplete redan hanterar (samma som en icke-timer-uppgift).
  function handleConfirmComplete() {
    const elapsed = readTodoTimerElapsedMs(todo.id, timerCapMinutes(todo));
    clear();
    onConfirmComplete(todo, elapsed);
  }

  const isCountdown = Boolean(todo.plannedDurationMinutes);
  const isHeld = timerHeldId === todo.id;
  // Förfluten tid just nu — ackumulerad från ev. tidigare (pausade)
  // perioder plus, om den körs just nu, tiden sedan senaste start/återupptag.
  // Golvat på 0 (2026-08-08, Zaidas önskemål: "Timern skall inte starta på
  // minus") — timerNow (förälderns 1s-tickande klocka) kan ligga strax FÖRE
  // startedAt (satt till Date.now() exakt vid start) tills nästa tick hinner
  // ikapp.
  const elapsedMs = accumulatedMs + (isRunning ? Math.max(0, timerNow - (startedAt as number)) : 0);

  const cardClassName = [
    "child-task-card",
    "child-task-card--timer",
    isRunning ? "child-task-card--timer-running" : "",
    isHeld ? "child-task-card--holding" : "",
    timeLeftPercent !== null ? "child-task-card--timed" : "",
  ].filter(Boolean).join(" ");

  const sharedHandlers = {
    onClick: registerTap,
    // 2026-08-10, Zaidas fynd: håll-in-för-att-avklara gick tidigare bara
    // att använda EFTER att timern startats (`if (!isActive) return`) —
    // en timer-uppgift som aldrig startats gick alltså inte att markera
    // klar alls, till skillnad från vuxenvyns motsvarande gest (Parent
    // ThreadView.tsx/FamilyTodoThreads.tsx), som aldrig haft den spärren.
    // Borttagen — håll-in fungerar nu alltid, precis som på en vanlig
    // uppgift utan timer. handleConfirmComplete läser elapsedMs som null om
    // timern aldrig startats, redan hanterat av onCompleteTodo.
    onPointerDown: () => {
      startTimerHold(todo.id, () => {
        suppressClickRef.current = true;
        handleConfirmComplete();
      });
    },
    onPointerLeave: clearTimerHold,
    onPointerCancel: clearTimerHold,
    onPointerUp: clearTimerHold,
  };

  if (isCountdown) {
    const totalMs = (todo.plannedDurationMinutes as number) * 60000;
    const remainingMs = isActive ? Math.max(0, totalMs - elapsedMs) : totalMs;
    return (
      <div
        className={cardClassName}
        style={{ ...style, touchAction: "none" }}
        {...sharedHandlers}
        role="button"
        tabIndex={0}
        aria-label={
          isPaused
            ? `${todo.title}, pausad vid ${formatElapsed(remainingMs)} kvar. Ett tryck återupptar, håll intryckt i två sekunder för att markera klar.`
            : isRunning
            ? `${todo.title}, ${formatElapsed(remainingMs)} kvar. Ett tryck pausar, håll intryckt i två sekunder för att markera klar.`
            : `${todo.title}. Tre snabba tryck startar nedräkningen på ${todo.plannedDurationMinutes} minuter, eller håll intryckt i två sekunder för att markera klar direkt.`
        }
      >
        <div className="child-task-icon-circle">
          <span className="child-task-icon">{todo.visual.value}</span>
        </div>
        <span className="child-task-copy">
          <span className={nameClass}>{todo.title}</span>
        </span>
        {starBadge}
        {isActive && (
          <span aria-live="polite" className="child-task-timer-digital">
            {formatElapsed(remainingMs)}
          </span>
        )}
      </div>
    );
  }

  // Öppen tidtagning (fallback) — för uppgifter med timerEnabled men UTAN
  // plannedDurationMinutes. Klockan räknar UPPÅT istället för nedåt, i
  // övrigt samma gester som nedräkningen ovan.
  return (
    <div
      className={cardClassName}
      style={{ ...style, touchAction: "none" }}
      {...sharedHandlers}
      role="button"
      tabIndex={0}
      aria-label={
        isPaused
          ? `${todo.title}, pausad vid ${formatElapsed(elapsedMs)}. Ett tryck återupptar, håll intryckt i två sekunder för att markera klar.`
          : isRunning
          ? `${todo.title}, ${formatElapsed(elapsedMs)} hittills. Ett tryck pausar, håll intryckt i två sekunder för att markera klar.`
          : `${todo.title}. Tre snabba tryck startar tidtagningen, eller håll intryckt i två sekunder för att markera klar direkt.`
      }
    >
      <div className="child-task-icon-circle">
        <span className="child-task-icon">{todo.visual.value}</span>
      </div>
      <span className="child-task-copy">
        <span className={nameClass}>{todo.title}</span>
      </span>
      {starBadge}
      {isActive && (
        <span aria-live="polite" className="child-task-timer-digital">
          {formatElapsed(elapsedMs)}
        </span>
      )}
    </div>
  );
}

type ChildTaskConfirmFlashProps = {
  todo: Todo;
  style: TaskCardStyle;
  nameClass: string;
  starBadge: ReactNode;
  elapsedMs: number | null;
};

// Bekräftelseflash när en ÖPPEN tidtagning (stoppur) avklaras via håll-in
// (2026-08-10, Zaidas önskemål: "vill jag se tiden den stannat på... innan
// den försvinner efter 3 sekunder") — icke-interaktivt, uppgiften är redan
// avklarad. Kortet lever kvar i ChildTasksSection.tsx:s confirmFlashes-state
// i tre sekunder EFTER att uppgiften redan lämnat `todos`-propen, sluttiden
// är fryst vid bekräftelsetillfället (inte en fortsatt tickande klocka).
// Gäller aldrig en nedräkning (plannedDurationMinutes) — den försvinner
// direkt istället, se ChildTasksSection.tsx:s handleConfirmComplete.
function ChildTaskConfirmFlash({ todo, style, nameClass, starBadge, elapsedMs }: ChildTaskConfirmFlashProps) {
  return (
    <div
      className="child-task-card child-task-card--timer child-task-card--confirm-flash"
      style={style}
      aria-live="polite"
      aria-label={`${todo.title}, klar${elapsedMs !== null ? ` på ${formatElapsed(elapsedMs)}` : ""}.`}
    >
      <div className="child-task-icon-circle">
        <span className="child-task-icon">{todo.visual.value}</span>
      </div>
      <span className="child-task-copy">
        <span className={nameClass}>{todo.title}</span>
      </span>
      {starBadge}
      {elapsedMs !== null && <span className="child-task-timer-digital">{formatElapsed(elapsedMs)}</span>}
    </div>
  );
}
