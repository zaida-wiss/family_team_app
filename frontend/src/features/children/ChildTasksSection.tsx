import type { CSSProperties } from "react";
import { Star } from "lucide-react";
import type { Id, Todo } from "@shared/types";
import "./ChildTasks.css";

type TaskCardStyle = CSSProperties & {
  "--task-accent"?: string;
  "--task-bg"?: string;
  "--task-time-left"?: string;
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

type TaskGroup = { category: string; todos: Todo[] };

function buildTaskGroups(todos: Todo[]): TaskGroup[] {
  const map = new Map<string, Todo[]>();
  for (const todo of todos) {
    const cat = todo.routineCategory ?? "";
    const bucket = map.get(cat) ?? [];
    bucket.push(todo);
    map.set(cat, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (!a && b ? 1 : a && !b ? -1 : a.localeCompare(b, "sv")))
    .map(([category, todos]) => ({ category, todos }));
}

type Props = {
  todos: Todo[];
  today: Date;
  timerNow: number;
  heldTodoId: Id | null;
  onStartHold: (id: Id) => void;
  onClearHold: () => void;
};

export function ChildTasksSection({ todos, today, timerNow, heldTodoId, onStartHold, onClearHold }: Props) {
  const taskGroups = buildTaskGroups(todos);
  if (taskGroups.length === 0) {
    return <p className="empty-note">Inga uppgifter idag – bra jobbat!</p>;
  }

  return (
    <section className="child-tasks-section" aria-label="Uppgifter idag">
      <div className="child-tasks-head">
        <h3 className="child-tasks-heading">Dina uppgifter idag</h3>
        <span>{getTodayHeading(today)}</span>
      </div>
      <div className="child-tasks-grid">
        {taskGroups
          .flatMap(({ category, todos }) => todos.map((todo) => ({ category, todo })))
          .map(({ category, todo }, i) => {
            const timeLeftPercent = getTimeLeftPercent(todo, timerNow);
            const style: TaskCardStyle = {
              animationDelay: `${i * 80}ms`,
              ...getTaskStyle(category),
              ...(timeLeftPercent === null ? {} : { "--task-time-left": `${timeLeftPercent}%` }),
            };
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
                  <span className={`child-task-name${todo.title.length > 30 ? " child-task-name--long" : todo.title.length > 18 ? " child-task-name--medium" : ""}`}>
                    {todo.title}
                  </span>
                </span>
                <span className="child-task-star-badge">
                  {Array.from({ length: Math.min(todo.starValue, 10) }, (_, i) => (
                    <Star key={i} size={12} fill="currentColor" />
                  ))}
                </span>
              </button>
            );
          })}
      </div>
    </section>
  );
}
