import "./TodoDetailModal.css";
import { Pencil, Play, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { fmtFullDate, fmtTime } from "../calendars/calendarHelpers";
import { useModalA11y } from "../../hooks/useModalA11y";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import { useLinkifiedText } from "../../hooks/useLinkifiedText";
import type { Id, Member, RecurrenceUnit, Todo } from "@shared/types";
import { WEEKDAY_SHORT } from "./recurringTodos";
import { SubtaskCountdown } from "./SubtaskCountdown";
import { sortSubtasksForDisplay } from "./selectors";
import { timerCapMinutes, useTodoTimer } from "./useTodoTimer";

type Props = {
  todo: Todo;
  assigneeName: string;
  assigneeColor?: string;
  categoryName: string | null;
  // Delmoment kan ha en egen tilldelad familjemedlem (2026-07-23) — bara
  // behövd för att slå upp namn/färg till den lilla, icke-interaktiva
  // markören i checklistan (redigeras i TodoEditModal, inte här).
  members: Member[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onClose: () => void;
  // Valfri (2026-08-01) — Hem-vyns familjetrådar (FamilyTodoThreads.tsx)
  // saknar en egen redigera-modal för todos i andra konton, döljer pennan.
  onEdit?: () => void;
};

function formatSchedule(todo: Todo): string | null {
  if (!todo.visibleFrom && !todo.expiresAt) return null;
  if (todo.visibleFrom && todo.expiresAt) {
    return `${fmtFullDate(todo.visibleFrom)} · ${fmtTime(todo.visibleFrom)}–${fmtTime(todo.expiresAt)}`;
  }
  if (todo.visibleFrom) return `Syns från ${fmtFullDate(todo.visibleFrom)} ${fmtTime(todo.visibleFrom)}`;
  return `Försvinner ${fmtFullDate(todo.expiresAt as string)} ${fmtTime(todo.expiresAt as string)}`;
}

const UNIT_LABEL: Record<RecurrenceUnit, string> = {
  day: "dag",
  week: "vecka",
  month: "månad",
  year: "år"
};

// En genererad daglig occurrence av en återkommande mall bär ALDRIG med sig
// mallens recurrence-regel (den är alltid "none" — occurrencen är en frusen
// engångskopia, se recurringTodos.ts), vilket gjorde att visa-vyn tyst
// visade INGEN återkommelse-info alls för en sådan uppgift — förvirrande
// (Zaida, 2026-07-08: "i bolltrådsvyn står den som inte återkommande om man
// redigerar, medans den i återkommande på inställningar står som
// återkommande"). Visar nu istället en tydlig hänvisning till var hela
// serien faktiskt redigeras.
function formatRecurrence(todo: Todo): string | null {
  if (todo.recurringSourceId !== null) {
    return "Del av en återkommande serie — ändra hela serien via Inställningar → 🔁 Återkommande uppgifter";
  }

  const recurrence = todo.recurrence;
  if (recurrence.type === "none") return null;

  const unitLabel = UNIT_LABEL[recurrence.unit];
  const everyLabel = recurrence.every === 1 ? `Varje ${unitLabel}` : `Var ${recurrence.every}:e ${unitLabel}`;

  if (recurrence.unit === "week" && recurrence.daysOfWeek) {
    return `${everyLabel}: ${recurrence.daysOfWeek.map((d) => WEEKDAY_SHORT[d]).join(", ")}`;
  }
  return everyLabel;
}

// Samma formatering som ChildTasksSection.tsx (duplicerad hellre än ett
// cross-feature-beroende, se Todo.elapsedMs-kommentaren i shared/types.ts).
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

// Timerkontroll för en ännu ej avklarad uppgift (2026-08-07/08, Zaidas
// önskemål: timern ska gå att välja för ALLA uppgifter, inte bara
// barn-tilldelade, och startas med TRE SNABBA TRYCK direkt på bubblan i
// BÅDA barnvyn och vuxenvyn). Den löpande tiden VISAS här, inne i modalen
// (Zaidas ord: "i vuxenvyn och familjevyn skall timern visas inne i
// modalen") — men startas antingen via tre-tryck på bubblan (se
// ParentTodoThreadView.tsx/FamilyTodoThreads.tsx) ELLER via knappen här,
// båda skriver till samma localStorage-nyckel. Avklarmarkering sker
// FORTFARANDE via den befintliga håll-in-gesten på bubblan (oförändrad) —
// den läser av samma localStorage-timer för att räkna ut elapsedMs.
function TodoTimerSection({ todo }: { todo: Todo }) {
  const { startedAt, accumulatedMs, isPaused, start, clear, togglePause } = useTodoTimer(todo.id, timerCapMinutes(todo));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const isRunning = startedAt !== null;
  const isCountdown = Boolean(todo.plannedDurationMinutes);
  // Ackumulerad tid från ev. tidigare pausade perioder (2026-08-09, "ett
  // snabbt tryck stoppar tiden") + tiden sedan senaste start/återupptag, om
  // den körs just nu — golvat på 0 (2026-08-08, "Timern skall inte starta
  // på minus": now, denna komponents egen 1s-tickande klocka, kan ligga
  // strax FÖRE startedAt tills nästa tick hinner ikapp).
  const elapsedMs = accumulatedMs + (isRunning ? Math.max(0, now - (startedAt as number)) : 0);

  let liveLabel: string | null = null;
  if (isRunning || isPaused) {
    if (isCountdown) {
      const totalMs = (todo.plannedDurationMinutes as number) * 60_000;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      liveLabel = `${formatElapsed(remainingMs)} kvar`;
    } else {
      liveLabel = formatElapsed(elapsedMs);
    }
  }

  return (
    <p className="todo-detail-modal__meta todo-detail-modal__timer">
      {isRunning ? (
        <>
          <span aria-live="polite">⏱ {liveLabel}</span>
          <button className="todo-detail-modal__timer-reset" onClick={togglePause} type="button">
            Pausa
          </button>
          <button className="todo-detail-modal__timer-reset" onClick={clear} type="button">
            Nollställ
          </button>
        </>
      ) : isPaused ? (
        <>
          <span aria-live="polite">⏱ {liveLabel} (pausad)</span>
          <button className="todo-detail-modal__timer-start" onClick={togglePause} type="button">
            <Play size={14} fill="currentColor" />
            Fortsätt
          </button>
          <button className="todo-detail-modal__timer-reset" onClick={clear} type="button">
            Nollställ
          </button>
        </>
      ) : (
        <button className="todo-detail-modal__timer-start" onClick={start} type="button">
          <Play size={14} fill="currentColor" />
          {isCountdown ? `Starta timer (${todo.plannedDurationMinutes} min)` : "Starta timer"}
        </button>
      )}
    </p>
  );
}

// Uppgifts-visa-modal (2026-07-05, Zaidas beslut) — ersätter den tidigare
// kombinerade TodoDetailModal. Läsbar info om uppgiften (som kalenderns
// CalendarEventDetail), INTE en redigeringsformulär. Delmomentens checklista
// är fortsatt interaktiv här — att bocka av ett delmoment är att utföra
// uppgiften, inte att redigera dess definition. En liten pennikon öppnar
// TodoEditModal för att ändra titel/kategori/schema/återkommande/anteckningar.
export function TodoDetailView({
  todo,
  assigneeName,
  assigneeColor,
  categoryName,
  members,
  onToggleSubtask,
  onClose,
  onEdit
}: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const subtasks = todo.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const progress = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;
  const schedule = formatSchedule(todo);
  const recurrence = formatRecurrence(todo);
  const overlay = useOverlayDismiss(onClose);
  const notesContent = useLinkifiedText(todo.notes);

  return (
    <div className="todo-detail-overlay" {...overlay}>
      <div
        aria-labelledby="todo-detail-title"
        aria-modal="true"
        className="todo-detail-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="todo-detail-modal__hdr">
          <div>
            <span id="todo-detail-title">
              {todo.visual.value && (
                <span aria-hidden="true" className="todo-detail-modal__title-icon">
                  {todo.visual.value}{" "}
                </span>
              )}
              {todo.title}
            </span>
            <small className="todo-detail-modal__assignee" style={assigneeColor ? { color: assigneeColor } : undefined}>
              {assigneeName}
            </small>
          </div>
          <div className="todo-detail-modal__hdr-actions">
            {onEdit && (
              <button aria-label="Redigera uppgift" className="icon-button" onClick={onEdit} type="button">
                <Pencil size={16} />
              </button>
            )}
            <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Delmoment + Anteckningar delar NU en enda scroll-yta (2026-08-09,
            Zaidas rättelse: "hela listan skall synas först, även om man inte
            ser anteckningar utan att skrolla först") — checklistan har inget
            eget tak/scroll längre (se .todo-detail-modal__checklist), utan
            renderas i sin FULLA längd; Anteckningar ligger direkt efter i
            samma dokumentflöde. Är delmomenten fler än vad som får plats
            skrollar man den GEMENSAMMA ytan (inte en liten inre listruta)
            för att nå Anteckningar — är listan kort ryms allt utan skroll. */}
        <div className="todo-detail-modal__scroll">
          <div className="todo-detail-modal__section">
            <h4 className="todo-detail-modal__section-title">Delmoment</h4>
            {subtasks.length > 0 ? (
              <>
                <div className="todo-detail-modal__progress">
                  <div
                    className="todo-detail-modal__progress-bar"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Andel avklarade delmoment"
                  >
                    <div className="todo-detail-modal__progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="todo-detail-modal__progress-label">{progress}% klart</span>
                </div>

                <ul className="todo-detail-modal__checklist">
                  {sortSubtasksForDisplay(subtasks).map((subtask) => {
                    const subtaskAssignee = members.find((m) => m.id === subtask.assignedTo);
                    return (
                      <li className="todo-detail-modal__checklist-item" key={subtask.id}>
                        <input
                          aria-label={subtaskAssignee ? `${subtask.title}, tilldelad ${subtaskAssignee.name}` : subtask.title}
                          checked={subtask.done}
                          onChange={() => onToggleSubtask(todo.id, subtask.id)}
                          type="checkbox"
                        />
                        <span className={subtask.done ? "todo-detail-modal__checklist-item-title--done" : ""}>
                          {subtask.title}
                        </span>
                        {subtask.done && subtask.timedMinutes != null && subtask.timerStartedAt && (
                          <SubtaskCountdown timedMinutes={subtask.timedMinutes} timerStartedAt={subtask.timerStartedAt} />
                        )}
                        {subtaskAssignee && (
                          <span
                            aria-hidden="true"
                            className="todo-detail-modal__checklist-item-assignee"
                            // Fallback till --primary när medlemmen saknar egen
                            // färg (samma fix som SubtaskAssigneeButton.tsx) —
                            // annars nästan osynlig vit initial mot en ljus
                            // var(--muted)-bakgrund.
                            style={{ background: subtaskAssignee.color ?? "var(--primary)" }}
                            title={subtaskAssignee.name}
                          >
                            {subtaskAssignee.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="todo-detail-modal__empty-hint">Inga delmoment ännu.</p>
            )}
          </div>

          <div className="todo-detail-modal__body todo-detail-modal__body--view">
            {(categoryName || schedule || recurrence) && (
              <p className="todo-detail-modal__meta">
                {[categoryName, schedule, recurrence].filter(Boolean).map((line, i, arr) => (
                  <Fragment key={line}>
                    {line}
                    {i < arr.length - 1 && <br />}
                  </Fragment>
                ))}
              </p>
            )}

            {todo.timerEnabled && todo.elapsedMs != null && (
              <p className="todo-detail-modal__meta">Tog {formatElapsed(todo.elapsedMs)}</p>
            )}

            {todo.timerEnabled && todo.elapsedMs == null && <TodoTimerSection todo={todo} />}

            <div className="todo-detail-modal__section">
              <h4 className="todo-detail-modal__section-title">Anteckningar</h4>
              {notesContent ? (
                <p className="todo-detail-modal__notes">{notesContent}</p>
              ) : (
                <p className="todo-detail-modal__empty-hint">Inga anteckningar ännu.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
