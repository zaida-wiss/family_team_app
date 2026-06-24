import { Star, Sparkles } from "lucide-react";
import type { Calendar, Id, Member, Reward, RewardPathProgress, Role, Todo } from "@shared/types";
import { ChildWeekView } from "./ChildWeekView";

type Props = {
  child: Member;
  calendars: Calendar[];
  roles: Role[];
  activeReward: Reward | null;
  rewardProgress: RewardPathProgress | null;
  suggestedRewards: Reward[];
  activeChildTodos: Todo[];
  wishTitle: string;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: Id) => void;
  onCompleteTodo: (todoId: Id) => void;
  onDismissRejectedTodo: (todoId: Id) => void;
  onThemePickerOpen: (memberId: Id) => void;
};

export function ChildDashboard({
  child,
  calendars,
  roles,
  activeReward,
  rewardProgress,
  suggestedRewards,
  activeChildTodos,
  wishTitle,
  onSetWishTitle,
  onCreateWish,
  onCompleteTodo,
  onDismissRejectedTodo,
  onThemePickerOpen
}: Props) {
  return (
    <article
      className={`child-dashboard theme-${child.dashboardTheme ?? "space"}`}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button, input, select")) {
          return;
        }

        let timeoutId: number;
        timeoutId = window.setTimeout(() => {
          onThemePickerOpen(child.id);
        }, 650);

        event.currentTarget.onpointerup = () => window.clearTimeout(timeoutId);
        event.currentTarget.onpointerleave = () => window.clearTimeout(timeoutId);
      }}
    >
      <header className="section-header">
        <div>
          <p className="eyebrow">Barn-dashboard</p>
          <h2>{child.name}</h2>
        </div>
        <Sparkles size={24} />
      </header>

      {activeReward && rewardProgress ? (
        <div className="reward-card">
          <span className="reward-label">{activeReward.title}</span>
          <strong>{rewardProgress.starsLeft} stjärnor kvar</strong>
        </div>
      ) : (
        <div className="wish-section">
          {suggestedRewards.length > 0 && (
            <ul className="suggested-rewards">
              {suggestedRewards.map((r) => (
                <li key={r.id}>
                  <span>{r.title}</span>
                  <small>Väntar på godkännande</small>
                </li>
              ))}
            </ul>
          )}
          <form
            className="wish-form"
            onSubmit={(e) => {
              e.preventDefault();
              onCreateWish(child.id);
            }}
          >
            <input
              type="text"
              value={wishTitle}
              onChange={(e) => onSetWishTitle(e.target.value)}
              placeholder="Vad önskar du dig?"
              aria-label="Önskning"
            />
            <button type="submit">Önska</button>
          </form>
        </div>
      )}

      <section className="falling-todos" aria-label="Aktiva uppgifter">
        {activeChildTodos.length === 0 ? (
          <p className="empty-note">Inga aktiva uppgifter just nu.</p>
        ) : (
          activeChildTodos.map((todo, index) => (
            <button
              className="falling-todo-card"
              key={todo.id}
              style={{ animationDelay: `${index * 120}ms` }}
              onClick={() => onCompleteTodo(todo.id)}
              type="button"
            >
              <span>{todo.visual.value.slice(0, 1)}</span>
              <strong>{todo.title}</strong>
              <small>Tryck när du är klar: {todo.starValue} stjärnor</small>
            </button>
          ))
        )}
      </section>

      {rewardProgress && rewardProgress.rejectedTodos.length > 0 && (
        <section className="rejected-notice" aria-label="Nekade uppgifter">
          {rewardProgress.rejectedTodos.map((todo) => (
            <div className="rejected-todo-card" key={todo.id}>
              <span>{todo.visual.value.slice(0, 1)}</span>
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

      {rewardProgress && (
        <div className="reward-path" aria-label="Belöningsbana">
          {Array.from({ length: 10 }).map((_, index) => {
            const item = rewardProgress.pathItems[index];
            const isApproved = item?.type === "approved-star";
            const pendingTodo = item?.type === "pending-task" ? item.todo : null;

            return (
              <span
                className={`path-step ${isApproved ? "approved" : ""} ${pendingTodo ? "pending" : ""}`}
                key={index}
              >
                {isApproved ? (
                  <Star size={18} fill="currentColor" />
                ) : pendingTodo ? (
                  pendingTodo.visual.value.slice(0, 1)
                ) : (
                  ""
                )}
              </span>
            );
          })}
        </div>
      )}

      <ChildWeekView calendars={calendars} child={child} roles={roles} />
    </article>
  );
}
