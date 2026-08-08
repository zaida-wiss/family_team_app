import type { CSSProperties } from "react";
import type { Id, Todo } from "@shared/types";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import "./ChildPendingBadges.css";

type Props = { todos: Todo[]; onUncomplete: (todoId: Id) => void };

// Ångra klarmarkering (2026-08-10, förenklat samma dag: ett håll-in+dra-uppåt-
// gest visade sig otillförlitlig, Zaidas fynd: "det går inte att dra upp
// ikonen... men det räcker att hålla in ikonen 2 sekunder så skall den hoppa
// tillbaka") — samma raka håll-in-2-sekunder-mönster som uppdragskortens
// egen klarmarkeringsgest, ingen dragning krävs längre.
const UNDO_HOLD_DURATION_MS = 2000;

export function ChildPendingBadges({ todos, onUncomplete }: Props) {
  const { heldId, startHold, clearHold } = useHoldToConfirm(UNDO_HOLD_DURATION_MS);

  if (todos.length === 0) return null;

  return (
    <div className="child-pending-badges" aria-label="Väntar på godkännande">
      {todos.map((todo, i) => (
        <button
          key={todo.id}
          type="button"
          className={["child-pending-badge", heldId === todo.id ? "child-pending-badge--holding" : ""]
            .filter(Boolean)
            .join(" ")}
          title={`${todo.title} – väntar på godkännande`}
          aria-label={`${todo.title}, väntar på godkännande. Håll intryckt i två sekunder för att ångra klarmarkeringen.`}
          onPointerDown={() => startHold(todo.id, () => onUncomplete(todo.id))}
          onPointerUp={clearHold}
          onPointerCancel={clearHold}
          onPointerLeave={clearHold}
        >
          <span
            className="child-pending-badge-icon"
            style={{ animationDuration: `${2.4 + i * 0.25}s` } as CSSProperties}
          >
            {todo.visual.value}
          </span>
        </button>
      ))}
    </div>
  );
}
