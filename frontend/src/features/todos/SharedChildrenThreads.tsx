import "./ParentTodoThreadView.css";
import { Lock } from "lucide-react";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { useSharedChildrenTodos } from "./useChildSharesState";

const HOLD_DURATION_MS = 2000;

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22) — en tråd PER barn som delats MED mig (av en förälder i ett
// annat, eller samma, konto). Medvetet en egen, enklare komponent istället
// för att byggas in i ParentTodoThreadView.tsx (redan 1000+ rader, delmoment/
// filter/drag-and-drop/kategorimeny hör inte hemma här — ett delat barns
// todos har varken egna kategorier eller delmoments-checklista i denna första
// version, se ADR-0024:s Uppföljning). Återanvänder samma .todo-thread__*-
// klasser för visuell konsekvens, bara håll-in-bekräftelsen (samma mönster
// som resten av tråd-vyn) är egen kod eftersom completeSharedTodo tar en
// annan signatur (childAccountId+childMemberId, inte bara todoId).
export function SharedChildrenThreads() {
  const { sharedChildren, completeSharedTodo } = useSharedChildrenTodos();
  const { heldId, startHold, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);

  if (sharedChildren.length === 0) return null;

  return (
    <div className="todo-thread-view">
      {sharedChildren.map(({ child, access, todos }) => {
        const pending = todos.filter((t) => t.status === "pending");
        return (
          <section className="todo-thread" aria-label={`Delad tråd: ${child.name}`} key={child.id}>
            <div className="todo-thread__header">
              <h3 className="todo-thread__category">
                {child.name}
                {access === "view" && (
                  <Lock aria-label="Endast visning" className="shared-child-thread__lock" size={14} />
                )}
              </h3>
            </div>

            {pending.length === 0 ? (
              <p className="todo-thread__empty">Allt avklarat här 🎉</p>
            ) : (
              <ul className="todo-thread__list">
                {pending.map((todo) => (
                  <li className="todo-thread__item" key={todo.id}>
                    <button
                      type="button"
                      className={
                        "todo-thread__ball todo-thread__ball--small" +
                        (heldId === todo.id ? " todo-thread__ball--holding" : "")
                      }
                      disabled={access !== "edit"}
                      onPointerDown={
                        access === "edit"
                          ? () => startHold(todo.id, () => completeSharedTodo(child.accountId, child.id, todo.id))
                          : undefined
                      }
                      onPointerUp={clearHold}
                      onPointerLeave={clearHold}
                      onPointerCancel={clearHold}
                      title={todo.title}
                      aria-label={
                        `${todo.title}, ${child.name}` +
                        (access === "edit" ? ". Håll intryckt i två sekunder för att markera klar." : ". Endast visning.")
                      }
                    >
                      {todo.visual.value && (
                        <span aria-hidden="true" className="todo-thread__ball-icon">
                          {todo.visual.value}
                        </span>
                      )}
                      <span className="todo-thread__ball-title">{todo.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
