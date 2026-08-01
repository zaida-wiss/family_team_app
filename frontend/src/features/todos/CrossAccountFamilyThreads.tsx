import "./ParentTodoThreadView.css";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { useCrossAccountFamilyTodos } from "./useCrossAccountFamilyState";

const HOLD_DURATION_MS = 2000;

// Mina familjekonton (2026-07-25, Zaidas önskemål: "när de används skall de
// dyka upp på ställen som todo som familjen vid rätt namn"). Skiljer sig
// från SharedChildrenThreads.tsx (ADR-0024, en delnings-GRANT från någon
// annan) — det här är MINA EGNA andra medlemskap, en tråd per konto,
// märkt med KONTOTS namn (inte ett barns namn). Samma enkla, egna
// komponent-princip som SharedChildrenThreads.tsx (ingen kategorimeny/
// delmoment/drag — bara den delade Familjen-listan, håll-in för att
// markera klar).
export function CrossAccountFamilyThreads() {
  const { threads, completeCrossAccountTodo } = useCrossAccountFamilyTodos();
  const { heldId, startHold, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);

  if (threads.length === 0) return null;

  return (
    <div className="todo-thread-view">
      {threads.map(({ accountId, accountName, todos: allTodos }) => {
        // Bara den OTAGNA poolen visas här (2026-08-01, Zaidas önskemål) —
        // en redan tagen uppgift (assignedTo satt, via "Ta uppgiften" i
        // Hem-vyns familjefilter) hör hemma i Mina uppgifter-tråden istället,
        // annars hade den synts DUBBELT.
        const todos = allTodos.filter((t) => t.assignedTo === null);
        return (
        <section className="todo-thread" aria-label={`Familjekonto: ${accountName}`} key={accountId}>
          <div className="todo-thread__header">
            <h3 className="todo-thread__category">{accountName}</h3>
          </div>

          {todos.length === 0 ? (
            <p className="todo-thread__empty">Allt avklarat här 🎉</p>
          ) : (
            <ul className="todo-thread__list">
              {todos.map((todo) => (
                <li className="todo-thread__item" key={todo.id}>
                  <button
                    type="button"
                    className={
                      "todo-thread__ball todo-thread__ball--small" +
                      (heldId === todo.id ? " todo-thread__ball--holding" : "")
                    }
                    onPointerDown={() => startHold(todo.id, () => completeCrossAccountTodo(accountId, todo.id))}
                    onPointerUp={clearHold}
                    onPointerLeave={clearHold}
                    onPointerCancel={clearHold}
                    title={todo.title}
                    aria-label={`${todo.title}, ${accountName}. Håll intryckt i två sekunder för att markera klar.`}
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
