import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Pencil, Star } from "lucide-react";
import type { Id, Todo, TodoCategory } from "@shared/types";
import { compareTodosByEndThenStart, type AssignedSubtaskCard } from "../todos/selectors";
import { useWakeLock } from "../../hooks/useWakeLock";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { useCountdownSound } from "../../hooks/useCountdownSound";
import { useLiveElapsed } from "../../hooks/useLiveElapsed";
import { formatDuration as formatElapsed, formatDurationWithHundredths as formatElapsedWithHundredths } from "../../utils/durationFormat";
import { readTodoTimerElapsedMs, timerCapMinutes, useTodoTimer } from "../todos/useTodoTimer";
import "./ChildTasks.css";

type TaskCardStyle = CSSProperties & {
  "--task-accent"?: string;
  "--task-bg"?: string;
  "--task-time-fraction"?: number;
};

const KNOWN_CATEGORIES = ["hälsa", "trivsel", "skills", "pengar"] as const;

export function getTaskStyle(category: string): TaskCardStyle {
  const norm = category.trim().toLocaleLowerCase("sv-SE");
  // Todos utan kategori (personalCategoryId null, t.ex. Familjen-poolen eller
  // barn-tilldelade uppgifter) ger en tom sträng här — utan denna tidiga
  // retur föll den tomma strängen igenom till hash-grenen nedan, där
  // [...""].reduce(...) alltid ger 0 och därmed alltid "hälsa"-färgen,
  // oavsett att kortet inte har någon kategori alls.
  if (!norm) {
    return { "--task-accent": "var(--muted-fg)", "--task-bg": "var(--card)" };
  }
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

// Delad nested redigera-knapp (2026-08-10) — stoppar propagation på BÅDE
// click OCH pointerdown/pointerup: kortets håll-in-gest startar redan vid
// onPointerDown (bubblar upp från VILKET barn-element som helst), inte bara
// vid click, så bara stopPropagation på click hade räckt för att öppna
// modalen men INTE för att hindra en samtidigt armerad 2s-håll-timer.
function EditTodoButton({ todo, onEditTodo }: { todo: Todo; onEditTodo: (todo: Todo) => void }) {
  return (
    <button
      aria-label={`Redigera ${todo.title}`}
      className="child-task-edit-btn"
      onClick={(e) => {
        e.stopPropagation();
        onEditTodo(todo);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      type="button"
    >
      <Pencil size={14} />
    </button>
  );
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
  // Delmoment tilldelade DENNA person, oavsett vem hela todon tillhör
  // (2026-08-12, Zaidas önskemål: "delmoment man är signad på hamnar på
  // dashboarden") — blandas rakt in i samma rutnät som de vanliga
  // uppdragskorten, se getAssignedSubtaskCards (todos/selectors.ts). Egen
  // håll-in-instans nedan (inte den delade heldTodoId/onStartHold ovan,
  // som styrs av föräldern och bara känner till hela todos) eftersom ett
  // bekräftat delmoment ska TOGGLA delmomentet, inte komplettera hela todon.
  subtaskCards: AssignedSubtaskCard[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  // Timerfunktion (2026-07-07, Zaidas önskemål) — separat väg förbi
  // håll-in-bekräftelsen: att trycka Klar på en pågående tidtagning ÄR
  // bekräftelsen, ingen ytterligare 2s-håll behövs ovanpå det.
  onCompleteTodo: (id: Id, elapsedMs: number | null) => void;
  // Redigera-knapp på kortet (2026-08-10, PersonalDashboard-uppföljning) —
  // MEDVETET valfri och opt-in. Komponenten delas rakt av med RIKTIGA barns
  // dashboard (ChildDashboard.tsx), som aldrig skickar med denna — ett barn
  // ska inte kunna öppna redigeringsläget för sin egen uppgift. Bara
  // PersonalDashboard.tsx (en vuxens egen vy) sätter den, och bara när
  // vyn visar den INLOGGADES EGEN dashboard (självval, ingen befintlig
  // behörighetsprincip finns för att redigera en ANNAN vuxens uppgifter
  // härifrån — se teamgenomgang-2026-08-10.md).
  onEditTodo?: (todo: Todo) => void;
};

// Dashboardens uppdragskort och tilldelade delmoment-kort renderas i EN
// gemensam, sluttids-sorterad lista (2026-08-13, Zaidas fråga: "har
// deluppgifterna fått huvuduppgiftens sluttid?") — se compareTodosByEndThenStart.
type RenderItem = { kind: "todo"; todo: Todo } | { kind: "subtask"; card: AssignedSubtaskCard };

const HOLD_DURATION_MS = 2000;
// Tre snabba tryck startar timern (2026-08-08, Zaidas önskemål: "tidtagning
// skall starta om man trycker 3 snabba tryck på uppgiften i både barnvy och
// vuxenvy") — samma tidsfönster som vuxenvyns motsvarande gest
// (ParentTodoThreadView.tsx/FamilyTodoThreads.tsx).
const TRIPLE_TAP_MS = 300;

export function ChildTasksSection({ todos, categories, today, timerNow, heldTodoId, onStartHold, onClearHold, onCompleteTodo, onEditTodo, subtaskCards, onToggleSubtask }: Props) {
  const { heldId: heldSubtaskKey, startHold: startSubtaskHold, clearHold: clearSubtaskHold } = useHoldToConfirm(HOLD_DURATION_MS);
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

  // Delmoment ärver förälder-todons visibleFrom/expiresAt (se
  // getAssignedSubtaskCards, todos/selectors.ts) så de kan sorteras med
  // SAMMA regel, in bland de vanliga korten — inte längre en egen,
  // osorterad klump sist.
  const renderItems: RenderItem[] = [
    ...renderTodos.map((todo): RenderItem => ({ kind: "todo", todo })),
    ...subtaskCards.map((card): RenderItem => ({ kind: "subtask", card })),
  ].sort((a, b) =>
    compareTodosByEndThenStart(a.kind === "todo" ? a.todo : a.card, b.kind === "todo" ? b.todo : b.card)
  );

  if (renderItems.length === 0) {
    return <p className="empty-note">Inga uppgifter idag – bra jobbat!</p>;
  }

  return (
    <section className="child-tasks-section" aria-label="Uppgifter idag">
      <div className="child-tasks-head">
        <h3 className="child-tasks-heading">Dina uppgifter idag</h3>
        <span>{getTodayHeading(today)}</span>
      </div>
      <div className="child-tasks-grid">
        {renderItems.map((item, i) => {
          if (item.kind === "subtask") {
            const card = item.card;
            const key = `${card.todoId}:${card.subtaskId}`;
            const nameClass = `child-task-name${card.title.length > 30 ? " child-task-name--long" : card.title.length > 18 ? " child-task-name--medium" : ""}`;
            return (
              <div
                key={key}
                className={[
                  "child-task-card",
                  "child-task-card--subtask",
                  heldSubtaskKey === key ? "child-task-card--holding" : "",
                ].filter(Boolean).join(" ")}
                style={{ animationDelay: `${i * 80}ms` }}
                onPointerDown={() => startSubtaskHold(key, () => onToggleSubtask(card.todoId, card.subtaskId))}
                onPointerLeave={clearSubtaskHold}
                onPointerCancel={clearSubtaskHold}
                onPointerUp={clearSubtaskHold}
                role="button"
                tabIndex={0}
              >
                <div className="child-task-icon-circle">
                  <span className="child-task-icon">{card.emoji ?? "📋"}</span>
                </div>
                <span className="child-task-copy">
                  <span className={nameClass}>
                    {card.title}
                  </span>
                </span>
              </div>
            );
          }

          const todo = item.todo;
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
                onEditTodo={onEditTodo}
                starBadge={starBadge}
                style={style}
                timeLeftPercent={timeLeftPercent}
                timerNow={timerNow}
                todo={todo}
              />
            );
          }

          return (
            <div
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
              role="button"
              tabIndex={0}
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
              {onEditTodo && <EditTodoButton onEditTodo={onEditTodo} todo={todo} />}
            </div>
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
  onEditTodo?: (todo: Todo) => void;
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
function ChildTimerTaskCard({ todo, style, nameClass, starBadge, timeLeftPercent, timerNow, onConfirmComplete, onEditTodo }: ChildTimerTaskCardProps) {
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

  // Tiden fryses vid HÅLL-IN-STARTEN (pointerDown, se sharedHandlers nedan),
  // inte här när bekräftelsen faktiskt löser ut — annars räknas hela 2-
  // sekundershållet in i den sparade tiden (Zaidas fynd 2026-08-10:
  // "tidtagningen måste stoppas när man börjar hålla 2 sekunder, inte efter
  // 2-3 sekunder"). Det fångade värdet skickas in som elapsedAtHoldStart.
  function handleConfirmComplete(elapsedAtHoldStart: number | null) {
    clear();
    onConfirmComplete(todo, elapsedAtHoldStart);
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
  const remainingMs = isCountdown ? Math.max(0, (todo.plannedDurationMinutes as number) * 60000 - elapsedMs) : 0;
  useCountdownSound(isCountdown, isRunning, remainingMs);

  // Hundradelar visas bara för ett aktivt körande ÖPPET stoppur (inte en
  // nedräkning, inte pausad) — useLiveElapsed driver en egen, snabbare klocka
  // (50ms) än förälderns 1s-tickande timerNow, som annars driver resten av
  // kortet (timeLeftPercent m.m.) och inte ska tvingas till en tätare takt
  // bara för detta.
  const isOpenStopwatchRunning = isRunning && !isCountdown;
  const fastElapsedMs = useLiveElapsed(startedAt, accumulatedMs, isOpenStopwatchRunning);

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
      const elapsedAtHoldStart = readTodoTimerElapsedMs(todo.id, timerCapMinutes(todo));
      startTimerHold(todo.id, () => {
        suppressClickRef.current = true;
        handleConfirmComplete(elapsedAtHoldStart);
      });
    },
    onPointerLeave: clearTimerHold,
    onPointerCancel: clearTimerHold,
    onPointerUp: clearTimerHold,
  };

  if (isCountdown) {
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
        {onEditTodo && <EditTodoButton onEditTodo={onEditTodo} todo={todo} />}
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
      {onEditTodo && <EditTodoButton onEditTodo={onEditTodo} todo={todo} />}
      {isActive && (
        <>
          {/* Skärmläsartext oförändrad (sekundtakt, samma som innan
              hundradelarna lades till) — den snabba visuella texten är
              aria-hidden för att inte spamma AT med 20 uppdateringar/s. */}
          <span aria-live="polite" className="sr-only">
            {formatElapsed(elapsedMs)}
          </span>
          <span aria-hidden="true" className="child-task-timer-digital">
            {isOpenStopwatchRunning ? formatElapsedWithHundredths(fastElapsedMs) : formatElapsed(elapsedMs)}
          </span>
        </>
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
