import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Star, Sparkles, Trophy, X } from "lucide-react";
import type { Calendar, Id, Member, Reward, RewardPathProgress, Role, Todo } from "@shared/types";
import { ChildTimeline } from "./ChildTimeline";

type Props = {
  child: Member;
  calendars: Calendar[];
  roles: Role[];
  activeReward: Reward | null;
  rewardProgress: RewardPathProgress | null;
  childRewards: Reward[];
  timelineTodos: Todo[];
  activeChildTodos: Todo[];
  rejectedTodos: Todo[];
  wishTitle: string;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: Id, starsNeeded: number) => void;
  onCompleteTodo: (todoId: Id) => void;
  onDismissRejectedTodo: (todoId: Id) => void;
};

type TaskCardStyle = CSSProperties & {
  "--task-timer-bg"?: string;
  "--task-time-left"?: string;
};

function getTodoTimeLeftPercent(todo: Todo, now: number) {
  if (!todo.visibleFrom || !todo.expiresAt) {
    return null;
  }

  const startsAt = new Date(todo.visibleFrom).getTime();
  const endsAt = new Date(todo.expiresAt).getTime();

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return null;
  }

  return Math.max(0, Math.min(100, ((endsAt - now) / (endsAt - startsAt)) * 100));
}

function getTodoTimerBackground(timeLeftPercent: number) {
  const hue = Math.round((timeLeftPercent / 100) * 128);
  return `hsl(${hue} 86% 72%)`;
}

function isWithinLastDay(isoStr: string | null, now: number) {
  if (!isoStr) return false;
  const time = new Date(isoStr).getTime();
  return Number.isFinite(time) && now - time <= 86_400_000;
}

function isSameLocalDay(isoStr: string | null, date: Date) {
  if (!isoStr) return false;
  const candidate = new Date(isoStr);
  return (
    candidate.getFullYear() === date.getFullYear() &&
    candidate.getMonth() === date.getMonth() &&
    candidate.getDate() === date.getDate()
  );
}

function getRewardStatusLabel(status: Reward["status"]) {
  if (status === "active") return "Godkänd";
  if (status === "suggested") return "Väntar";
  if (status === "unlocked") return "Upplåst";
  if (status === "redeemed") return "Inlöst";
  return "Nekad";
}

export function ChildDashboard({
  child,
  calendars,
  roles,
  activeReward,
  rewardProgress,
  childRewards,
  timelineTodos,
  activeChildTodos,
  rejectedTodos,
  wishTitle,
  onSetWishTitle,
  onCreateWish,
  onCompleteTodo,
  onDismissRejectedTodo,
}: Props) {
  const [wishStars, setWishStars] = useState(10);
  const [isWishModalOpen, setIsWishModalOpen] = useState(false);
  const [heldTodoId, setHeldTodoId] = useState<Id | null>(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [completedCue, setCompletedCue] = useState<{
    id: Id;
    title: string;
    visual: string;
    starValue: number;
  } | null>(null);
  const completeHoldRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const completeCueRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const taskGroups = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of activeChildTodos) {
      const cat = todo.routineCategory ?? "";
      const bucket = map.get(cat) ?? [];
      bucket.push(todo);
      map.set(cat, bucket);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (!a && b) return 1;
        if (a && !b) return -1;
        return a.localeCompare(b, "sv");
      })
      .map(([category, todos]) => ({ category, todos }));
  }, [activeChildTodos]);

  const nowMs = timerNow;
  const rejected = rejectedTodos;
  const approvedStarsTotal = timelineTodos
    .filter((todo) => todo.assignedTo === child.id && todo.status === "approved" && todo.deletedAt === null)
    .reduce((sum, todo) => sum + todo.starValue, 0);
  const approvedStarsToday = timelineTodos
    .filter(
      (todo) =>
        todo.assignedTo === child.id &&
        todo.status === "approved" &&
        todo.deletedAt === null &&
        isSameLocalDay(todo.approvedAt ?? todo.completedAt, new Date(nowMs))
    )
    .reduce((sum, todo) => sum + todo.starValue, 0);
  const modalRewards = childRewards
    .filter((reward) => {
      if (reward.status === "rejected") {
        return isWithinLastDay(reward.deletedAt, nowMs);
      }
      return reward.deletedAt === null;
    })
    .sort((a, b) => {
      const order: Record<Reward["status"], number> = {
        active: 0,
        unlocked: 1,
        redeemed: 2,
        suggested: 3,
        rejected: 4,
      };
      return order[a.status] - order[b.status] || a.title.localeCompare(b.title, "sv");
    });

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  function clearCompleteHold() {
    if (completeHoldRef.current !== null) {
      window.clearTimeout(completeHoldRef.current);
      completeHoldRef.current = null;
    }
    setHeldTodoId(null);
  }

  function startCompleteHold(todoId: Id) {
    const todo = activeChildTodos.find((item) => item.id === todoId);
    if (!todo) {
      return;
    }

    clearCompleteHold();
    setHeldTodoId(todoId);
    completeHoldRef.current = window.setTimeout(() => {
      setCompletedCue({
        id: todo.id,
        title: todo.title,
        visual: todo.visual.value,
        starValue: todo.starValue
      });
      onCompleteTodo(todoId);
      completeHoldRef.current = null;
      setHeldTodoId(null);
      if (completeCueRef.current !== null) {
        window.clearTimeout(completeCueRef.current);
      }
      completeCueRef.current = window.setTimeout(() => {
        setCompletedCue(null);
        completeCueRef.current = null;
      }, 1800);
    }, 2000);
  }

  useEffect(
    () => () => {
      if (completeHoldRef.current !== null) {
        window.clearTimeout(completeHoldRef.current);
      }
      if (completeCueRef.current !== null) {
        window.clearTimeout(completeCueRef.current);
      }
    },
    []
  );

  return (
    <article className={`child-dashboard theme-${child.dashboardTheme ?? "space"}`}>
      <div className="child-dashboard-body">
        {/* LEFT — weekly timeline */}
        <div className="child-dashboard-left">
          <ChildTimeline calendars={calendars} child={child} roles={roles} todos={timelineTodos} />
        </div>

        {/* CENTER — tasks, routines and status panels */}
        <div className="child-dashboard-main">
          <header className="section-header">
            <h2 className="section-title">Hej {child.name}!</h2>
            <Sparkles size={22} />
          </header>

          {/* Tasks today */}
          {taskGroups.length > 0 && (
            <section className="child-tasks-section" aria-label="Uppgifter idag">
              <h3 className="child-tasks-heading">Dina uppgifter idag</h3>
              <div className="child-tasks-grid">
                {taskGroups.flatMap(({ todos }) => todos).map((todo, i) => {
                  const timeLeftPercent = getTodoTimeLeftPercent(todo, timerNow);
                  const taskStyle: TaskCardStyle = {
                    animationDelay: `${i * 80}ms`,
                    ...(timeLeftPercent === null
                      ? {}
                      : {
                        "--task-timer-bg": getTodoTimerBackground(timeLeftPercent),
                        "--task-time-left": `${timeLeftPercent}%`,
                      }),
                  };

                  return (
                    <button
                      key={todo.id}
                      className={[
                        "child-task-card",
                        heldTodoId === todo.id ? "child-task-card--holding" : "",
                        timeLeftPercent !== null ? "child-task-card--timed" : "",
                      ].filter(Boolean).join(" ")}
                      style={taskStyle}
                      onPointerDown={() => startCompleteHold(todo.id)}
                      onPointerLeave={clearCompleteHold}
                      onPointerCancel={clearCompleteHold}
                      onPointerUp={clearCompleteHold}
                      type="button"
                    >
                      <div className="child-task-icon-circle">
                        <span className="child-task-icon">{todo.visual.value}</span>
                      </div>
                      <span className="child-task-name">{todo.title}</span>
                      <span className="child-task-star-badge">
                        <Star size={14} fill="currentColor" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {activeChildTodos.length === 0 && (
            <p className="empty-note">Inga uppgifter idag – bra jobbat!</p>
          )}

          {/* Rejected */}
          {rejected.length > 0 && (
            <section className="rejected-notice" aria-label="Nekade uppgifter">
              {rejected.map((todo) => (
                <div className="rejected-todo-card" key={todo.id}>
                  <span>{todo.visual.value}</span>
                  <div>
                    <strong>{todo.title}</strong>
                    <small>Den här gick inte igenom – prova igen!</small>
                  </div>
                  <button
                    className="rejected-dismiss"
                    type="button"
                    onClick={() => onDismissRejectedTodo(todo.id)}
                    aria-label="Stäng"
                  >
                    Okej
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Bottom panels */}
          <div className="child-bottom-panels">
            {/* Wishes */}
            <div className="child-panel child-wish-compact-panel">
              <div className="child-panel-head">
                <Sparkles size={18} />
                <span>Önskningar</span>
              </div>
              <form
                className="wish-form child-wish-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  onCreateWish(child.id, wishStars);
                }}
              >
                <input
                  type="text"
                  className="wish-form-input"
                  value={wishTitle}
                  onChange={(e) => onSetWishTitle(e.target.value)}
                  placeholder="Jag önskar mig…"
                  aria-label="Ny önskning"
                />
                <input
                  type="number"
                  className="wish-form-stars"
                  value={wishStars}
                  min={1}
                  max={999}
                  onChange={(e) => setWishStars(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  aria-label="Antal stjärnor"
                />
                <button className="wish-form-btn" type="submit">Önska</button>
              </form>
              <button
                className="child-wish-modal-button"
                type="button"
                onClick={() => setIsWishModalOpen(true)}
              >
                <Trophy size={15} />
                <span>Visa önskningar</span>
              </button>
            </div>
          </div>
          {completedCue && (
            <div className="child-complete-cue" role="status" aria-live="polite">
              <div className="child-complete-cue-icon">
                <span>{completedCue.visual}</span>
              </div>
              <div>
                <strong>{completedCue.title}</strong>
                <small>Flyttad till väntar på godkännande</small>
              </div>
              <span className="child-complete-cue-stars">
                +{completedCue.starValue} <Star size={12} fill="currentColor" />
              </span>
            </div>
          )}
        </div>

        <aside className="child-dashboard-reward" aria-label="Belöningsbana">
          <div className="child-reward-rail">
            <div className="child-reward-day-stars" aria-label="Stjärnor idag">
              <span>Idag</span>
              <strong>{approvedStarsToday}</strong>
              <Star size={13} fill="currentColor" />
            </div>
            <div className="child-reward-card-top">
              <div className="child-reward-card-label">
                <Trophy size={15} />
                <span>Belöningsbana</span>
              </div>
              {activeReward && rewardProgress ? (
                <div className="child-reward-stars-count">
                  <Star size={13} fill="currentColor" />
                  <span>{rewardProgress.approvedStars}</span>
                  <span className="child-reward-stars-of">/ {activeReward.starsNeeded}</span>
                </div>
              ) : null}
            </div>
            {activeReward && rewardProgress ? (
              <>
                <div className="child-reward-goal">{activeReward.title}</div>
                <small className="child-reward-left">{rewardProgress.starsLeft} stjärnor kvar</small>
                <div className="child-reward-track child-reward-track--vertical">
                  {Array.from({ length: Math.min(activeReward.starsNeeded, 14) }).map((_, i) => {
                    const item = rewardProgress.pathItems[i];
                    const isApproved = item?.type === "approved-star";
                    const pendingTodo = item?.type === "pending-task" ? item.todo : null;
                    const isLast = i === Math.min(activeReward.starsNeeded, 14) - 1;
                    return (
                      <div
                        key={i}
                        className={`child-reward-step${isApproved ? " child-reward-step--done" : ""}${pendingTodo ? " child-reward-step--pending" : ""}`}
                      >
                        {isLast ? <Trophy size={14} /> : isApproved ? <Star size={12} fill="currentColor" /> : pendingTodo ? <span>{pendingTodo.visual.value}</span> : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="child-panel-empty">Ingen aktiv önskning ännu.</p>
            )}
          </div>
        </aside>
      </div>
      {isWishModalOpen && (
        <div className="child-wish-modal-backdrop" onClick={() => setIsWishModalOpen(false)}>
          <section
            className="child-wish-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Barnets önskningar"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="child-wish-modal-head">
              <div>
                <h3>Önskningar</h3>
                <p>
                  <Star size={13} fill="currentColor" />
                  {approvedStarsTotal} stjärnor totalt
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Stäng önskningar"
                onClick={() => setIsWishModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="child-wish-modal-list">
              {modalRewards.length === 0 ? (
                <p className="child-panel-empty">Inga önskningar ännu.</p>
              ) : (
                modalRewards.map((reward) => (
                  <div
                    key={reward.id}
                    className={`child-wish-row child-wish-row--${reward.status}`}
                  >
                    <Trophy size={18} className="child-wish-trophy" />
                    <div className="child-wish-info">
                      <span className="child-wish-title">{reward.title}</span>
                      <small>{reward.starsNeeded} stjärnor · {getRewardStatusLabel(reward.status)}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
