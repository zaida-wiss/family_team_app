import "./ParentTodoThreadView.css";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { useConnectionTodos } from "../accounts/useFamilyConnectionsState";

const HOLD_DURATION_MS = 2000;

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"). Skiljer sig från CrossAccountFamilyThreads.tsx (ett
// riktigt medlemskap) och SharedChildrenThreads.tsx (ett helt delat barn) —
// det här visar bara de SPECIFIKA exponerade medlemmarnas todos från en
// ansluten familj, aldrig sammanslaget med mina egna trådar. Read-only vid
// "view"-åtkomst; "edit" ger samma håll-in-för-att-markera-klar-gest plus
// godkänn/neka på redan avklarade, samma mönster som ett delat barn.
export function ConnectionTodosThreads() {
  const { threads, completeConnectionTodo, approveConnectionTodo, rejectConnectionTodo } = useConnectionTodos();
  const { heldId, startHold, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);

  if (threads.length === 0) return null;

  return (
    <div className="todo-thread-view">
      {threads.map(({ accountId, accountName, access, todos }) => (
        <section className="todo-thread" aria-label={`Ansluten familj: ${accountName}`} key={accountId}>
          <div className="todo-thread__header">
            <h3 className="todo-thread__category">{accountName}</h3>
            <small>{access === "edit" ? "Kan redigera" : "Kan visa"}</small>
          </div>

          {todos.length === 0 ? (
            <p className="todo-thread__empty">Inga uppgifter just nu</p>
          ) : (
            <ul className="todo-thread__list">
              {todos.map((todo) => (
                <li className="todo-thread__item" key={todo.id}>
                  {access === "edit" ? (
                    <button
                      aria-label={`${todo.title}, ${accountName}. Håll intryckt i två sekunder för att markera klar.`}
                      className={
                        "todo-thread__ball todo-thread__ball--small" +
                        (heldId === todo.id ? " todo-thread__ball--holding" : "")
                      }
                      onPointerCancel={clearHold}
                      onPointerDown={() => todo.status === "pending" && startHold(todo.id, () => completeConnectionTodo(accountId, todo.id))}
                      onPointerLeave={clearHold}
                      onPointerUp={clearHold}
                      title={todo.title}
                      type="button"
                    >
                      {todo.visual.value && (
                        <span aria-hidden="true" className="todo-thread__ball-icon">
                          {todo.visual.value}
                        </span>
                      )}
                      <span className="todo-thread__ball-title">{todo.title}</span>
                    </button>
                  ) : (
                    <div className="todo-thread__ball todo-thread__ball--small" title={todo.title}>
                      {todo.visual.value && (
                        <span aria-hidden="true" className="todo-thread__ball-icon">
                          {todo.visual.value}
                        </span>
                      )}
                      <span className="todo-thread__ball-title">{todo.title}</span>
                    </div>
                  )}
                  {access === "edit" && todo.status === "done" && (
                    <div className="child-share-list__row">
                      <button
                        className="wish-form-btn"
                        onClick={() => approveConnectionTodo(accountId, todo.id)}
                        type="button"
                      >
                        Godkänn
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => rejectConnectionTodo(accountId, todo.id, null)}
                        type="button"
                      >
                        Neka
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
