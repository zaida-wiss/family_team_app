import type { CSSProperties } from "react";
import type { Id, Todo } from "@shared/types";
import { useHoldDragConfirm } from "../../hooks/useHoldDragConfirm";
import "./ChildPendingBadges.css";

type Props = { todos: Todo[]; onUncomplete: (todoId: Id) => void };

const UNDO_HOLD_DURATION_MS = 2000;
// Hur långt uppåt badgen måste dras innan hållet får bekräfta (2026-08-10,
// Zaidas önskemål: "gör samma långa tryck på den lilla snurrande ikonen och
// drar upp den igen mot uppdragskortens placering") — lågt satt (badgarna
// är små och sitter redan nära uppdragskortens område) så gesten känns
// naturlig utan att kräva en orimligt lång dragrörelse.
const UNDO_DRAG_THRESHOLD_PX = 20;
// Maximal visuell "lyft"-höjd under draget — badgen ska kännas dragen, men
// inte flyga iväg långt bortom sin egen rad.
const MAX_LIFT_PX = 34;

export function ChildPendingBadges({ todos, onUncomplete }: Props) {
  const { state, start, move, clear } = useHoldDragConfirm(UNDO_HOLD_DURATION_MS, UNDO_DRAG_THRESHOLD_PX);

  if (todos.length === 0) return null;

  return (
    <div className="child-pending-badges" aria-label="Väntar på godkännande">
      {todos.map((todo, i) => {
        const isHeld = state?.id === todo.id;
        const lift = isHeld ? Math.min(state.dy, MAX_LIFT_PX) : 0;
        const armed = isHeld && state.armed;
        // Bygger BÅDE lyftet och en armed-förstoring i SAMMA inline transform
        // (2026-08-10) — animationen som snurrar ikonen sitter på det inre
        // <span>:et, inte här, just för att undvika att en CSS-animation som
        // redan äger `transform` (spinnet) tystar bort en konkurrerande
        // transform-deklaration på SAMMA element (CSS-animationer vinner
        // alltid över vanliga deklarationer för samma egenskap, inline eller ej).
        const transform = lift || armed ? `translateY(-${lift}px) scale(${armed ? 1.15 : 1})` : undefined;
        return (
          <button
            key={todo.id}
            type="button"
            className={[
              "child-pending-badge",
              isHeld ? "child-pending-badge--holding" : "",
              armed ? "child-pending-badge--armed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={(transform ? { transform } : {}) as CSSProperties}
            title={`${todo.title} – väntar på godkännande`}
            aria-label={`${todo.title}, väntar på godkännande. Håll intryckt och dra uppåt för att ångra klarmarkeringen.`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              start(todo.id, e.clientY, () => onUncomplete(todo.id));
            }}
            onPointerMove={(e) => {
              if (isHeld) move(e.clientY);
            }}
            onPointerUp={clear}
            onPointerCancel={clear}
            onPointerLeave={clear}
          >
            <span
              className="child-pending-badge-icon"
              style={{ animationDuration: `${2.4 + i * 0.25}s` } as CSSProperties}
            >
              {todo.visual.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
