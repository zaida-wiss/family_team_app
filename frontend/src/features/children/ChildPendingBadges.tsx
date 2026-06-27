import type { CSSProperties } from "react";
import type { Todo } from "@shared/types";
import "./ChildPendingBadges.css";

type Props = { todos: Todo[] };

export function ChildPendingBadges({ todos }: Props) {
  if (todos.length === 0) return null;

  return (
    <div className="child-pending-badges" aria-label="Väntar på godkännande">
      {todos.map((todo, i) => (
        <div
          key={todo.id}
          className="child-pending-badge"
          style={{ animationDuration: `${2.4 + i * 0.25}s` } as CSSProperties}
          title={`${todo.title} – väntar på godkännande`}
        >
          <span className="child-pending-badge-icon">{todo.visual.value}</span>
        </div>
      ))}
    </div>
  );
}
