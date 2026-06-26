import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Banknote, ChevronLeft, ChevronRight, Palette, ShoppingBag, Star, Trophy, X } from "lucide-react";
import type { Calendar, Id, Member, Reward, RewardPathProgress, Role, Todo } from "@shared/types";
import { ChildTimeline } from "./ChildTimeline";
import "./ChildRewardRail.css";
import "./ChildTaskCard.css";
import "./ChildStarsPanel.css";
import "./ChildWishModal.css";
import "./ChildDashboard.css";

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
  onThemePickerOpen: (memberId: Id) => void;
};

type TaskCardStyle = CSSProperties & {
  "--task-accent"?: string;
  "--task-bg"?: string;
  "--task-time-left"?: string;
};

type DayPillStyle = CSSProperties & {
  "--day-bg"?: string;
  "--day-fg"?: string;
};

type TaskColor = {
  accent: string;
  bg: string;
};

const CHILD_TASK_COLORS = [
  { accent: "#7aa986", bg: "#edf5e9" },
  { accent: "#d98c82", bg: "#fae4df" },
  { accent: "#7fa4d2", bg: "#e8f1fb" },
  { accent: "#b985d0", bg: "#f0e2f7" },
  { accent: "#d8b765", bg: "#f8edce" },
];

const CATEGORY_TASK_COLORS: Record<string, TaskColor> = {
  fritid: { accent: "#b985d0", bg: "#f0e2f7" },
  familj: { accent: "#d98c82", bg: "#fae4df" },
  hem: { accent: "#d3a46f", bg: "#f5e8d8" },
  hushåll: { accent: "#d3a46f", bg: "#f5e8d8" },
  hälsa: { accent: "#7aa986", bg: "#edf5e9" },
  hygien: { accent: "#7fa4d2", bg: "#e8f1fb" },
  mat: { accent: "#d8b765", bg: "#f8edce" },
  måltid: { accent: "#d8b765", bg: "#f8edce" },
  rörelse: { accent: "#cf8980", bg: "#f8e2dd" },
  skola: { accent: "#7d9fca", bg: "#e9f0fa" },
  sömn: { accent: "#82a98d", bg: "#e8f3e8" },
};

const WEEKDAY_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const NPF_DAY_COLORS = [
  { bg: "#f9dcd8", fg: "#7b1f1f" },
  { bg: "#dff1e4", fg: "#345f42" },
  { bg: "#dcecff", fg: "#173c72" },
  { bg: "#e8edf4", fg: "#1f3d68" },
  { bg: "#f1dfcf", fg: "#4d3329" },
  { bg: "#f1dfd1", fg: "#4f342b" },
  { bg: "#f8d8ef", fg: "#7a2d5c" },
];

function getWeekStripDays(now = new Date()) {
  const monday = new Date(now);
  const dow = (now.getDay() + 6) % 7;
  monday.setDate(now.getDate() - dow);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

function getTodayHeading(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { weekday: "long" }).format(date);
}

function getTaskColorForCategory(category: string): TaskColor {
  const normalized = category.trim().toLocaleLowerCase("sv-SE");
  if (!normalized) {
    return CHILD_TASK_COLORS[0];
  }

  const matchedKey = Object.keys(CATEGORY_TASK_COLORS).find((key) => normalized.includes(key));
  if (matchedKey) {
    return CATEGORY_TASK_COLORS[matchedKey];
  }

  const hash = [...normalized].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CHILD_TASK_COLORS[hash % CHILD_TASK_COLORS.length];
}

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
  onThemePickerOpen,
}: Props) {
  const [wishStars, setWishStars] = useState(10);
  const [isWishModalOpen, setIsWishModalOpen] = useState(false);
  const [heldTodoId, setHeldTodoId] = useState<Id | null>(null);
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [selectedDay, setSelectedDay] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
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
  const pendingApprovalTodos = timelineTodos
    .filter(
      (todo) =>
        todo.assignedTo === child.id &&
        todo.status === "done" &&
        todo.deletedAt === null
    )
    .sort((a, b) => {
      const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return timeB - timeA;
    })
    .slice(0, 8);
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
  const today = new Date(nowMs);
  const weekStripDays = getWeekStripDays(selectedDay);
  const totalApprovedStars = approvedStarsTotal;

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

  function moveSelectedWeek(direction: -1 | 1) {
    setSelectedDay((current) => {
      const next = new Date(current);
      next.setDate(current.getDate() + direction * 7);
      next.setHours(0, 0, 0, 0);
      return next;
    });
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
          <ChildTimeline
            calendars={calendars}
            child={child}
            roles={roles}
            selectedDay={selectedDay}
            todos={timelineTodos}
          />
        </div>

        {/* CENTER — tasks, routines and status panels */}
        <div className="child-dashboard-main">
          <div className="child-week-nav">
            <button
              className="child-week-arrow"
              type="button"
              onClick={() => moveSelectedWeek(-1)}
              aria-label="Föregående vecka"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="child-day-strip" aria-label="Veckodagar">
              {weekStripDays.map((day) => {
                const isSelected = isSameLocalDay(day.toISOString(), selectedDay);
                const dayColor = NPF_DAY_COLORS[day.getDay()];
                const dayStyle: DayPillStyle = {
                  "--day-bg": dayColor.bg,
                  "--day-fg": dayColor.fg,
                };

                return (
                  <button
                    className={`child-day-pill${isSelected ? " child-day-pill--selected" : ""}`}
                    key={day.toISOString()}
                    type="button"
                    style={dayStyle}
                    onClick={() => setSelectedDay(day)}
                    aria-pressed={isSelected}
                  >
                    <span>{WEEKDAY_SHORT[day.getDay()]}</span>
                    <strong>{day.getDate()}</strong>
                  </button>
                );
              })}
            </div>
            <button
              className="child-week-arrow"
              type="button"
              onClick={() => moveSelectedWeek(1)}
              aria-label="Nästa vecka"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <header className="child-hero">
            <div>
              <p className="child-hero-month">{MONTHS_SHORT[today.getMonth()]}</p>
              <h2 className="section-title">Hej {child.name}! <span aria-hidden="true">👋</span></h2>
              <p>Tryck på dina uppgifter när du är klar. Håll fingret länge för att lämna in.</p>
            </div>
            <div className="child-hero-actions">
              <button
                className="child-theme-button"
                type="button"
                onClick={() => onThemePickerOpen(child.id)}
                aria-label="Byt tema"
                title="Byt tema"
              >
                <Palette size={18} />
              </button>
              <div className="child-hero-avatar" aria-hidden="true">
                {child.avatarUrl ? <img src={child.avatarUrl} alt="" /> : <span>🦊</span>}
              </div>
            </div>
          </header>

          {/* Tasks today */}
          {taskGroups.length > 0 && (
            <section className="child-tasks-section" aria-label="Uppgifter idag">
              <div className="child-tasks-head">
                <h3 className="child-tasks-heading">Dina uppgifter idag</h3>
                <span>{getTodayHeading(today)}</span>
              </div>
              <div className="child-tasks-grid">
                {taskGroups.flatMap(({ category, todos }) =>
                  todos.map((todo) => ({ category, todo }))
                ).map(({ category, todo }, i) => {
                  const timeLeftPercent = getTodoTimeLeftPercent(todo, timerNow);
                  const color = getTaskColorForCategory(category);
                  const taskStyle: TaskCardStyle = {
                    animationDelay: `${i * 80}ms`,
                    "--task-accent": color.accent,
                    "--task-bg": color.bg,
                    ...(timeLeftPercent === null
                      ? {}
                      : {
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
                      <span className="child-task-copy">
                        <span className="child-task-name">{todo.title}</span>
                      </span>
                      <span className="child-task-star-badge">
                        <Star size={14} fill="currentColor" />
                        <span>{todo.starValue}</span>
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
            <div className="child-stars-panel">
              {pendingApprovalTodos.length > 0 && (
                <div className="child-pending-symbols" aria-label="Väntar på godkännande">
                  {pendingApprovalTodos.map((todo) => (
                    <span className="child-pending-symbol" key={todo.id} title={todo.title}>
                      {todo.visual.value}
                    </span>
                  ))}
                </div>
              )}
              <div className="child-stars-stat">
                <span>Stjärnor idag</span>
                <strong><Star size={34} fill="currentColor" /> {approvedStarsToday}</strong>
              </div>
              <div className="child-stars-stat child-stars-stat--total">
                <span>Totalt</span>
                <strong><Star size={34} fill="currentColor" /> {totalApprovedStars}</strong>
              </div>
              <button
                className="child-shop-card"
                type="button"
                onClick={() => setIsWishModalOpen(true)}
              >
                <ShoppingBag size={28} />
                <span>
                  <strong>Shop</strong>
                  <small>Använd dina stjärnor</small>
                </span>
              </button>
              <div className="child-money-card" aria-label={`${approvedStarsTotal} stjärnor är ${approvedStarsTotal} kronor`}>
                <Banknote size={28} />
                <span>
                  <strong>{approvedStarsTotal} stjärnor</strong>
                  <small>= {approvedStarsTotal} kr</small>
                </span>
              </div>
              {activeReward && rewardProgress && (
                <div className="child-active-reward-mini">
                  <Trophy size={16} />
                  <span>{activeReward.title}</span>
                  <small>{rewardProgress.starsLeft} stjärnor kvar</small>
                </div>
              )}
              <small className="child-stars-footnote">1 stjärna = 1 kr</small>
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
              <form
                className="wish-form child-wish-form child-wish-modal-form"
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
                  placeholder="Jag önskar mig..."
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
