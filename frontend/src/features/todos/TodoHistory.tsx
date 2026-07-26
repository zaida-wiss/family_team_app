import "./TodoHistory.css";
import type { Member, Role, Todo } from "@shared/types";
import { getAssigneeName, getTodoHistory } from "./selectors";
import { useTodosHistoryState } from "./useTodosHistoryState";

type Props = {
  currentMember: Member;
  roles: Role[];
  allMembers: Member[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(status: Todo["status"]) {
  if (status === "approved") return "Godkänd";
  if (status === "rejected") return "Nekad";
  return "Utgången";
}

export function TodoHistory({ currentMember, roles, allMembers }: Props) {
  // Paginerad (2026-07-26) — getTodoHistory filtrerar/sorterar de hittills
  // hämtade sidorna (samma getVisibleTodos+isTodoHistory-selektor som
  // tidigare, bara matad med den nya paginerade källan istället för hela
  // todos-listan).
  const { items, total, loading, loadMore } = useTodosHistoryState();
  const history = getTodoHistory(currentMember, roles, items);
  const hasMore = total !== null && items.length < total;

  if (history.length === 0) {
    return <p className="empty-note">{loading ? "Laddar…" : "Ingen historik än."}</p>;
  }

  return (
    <>
      <ul className="todo-history-list" aria-label="Todo-historik">
        {history.map((todo) => (
          <li className="todo-history-row" key={todo.id}>
            <div className="todo-history-info">
              <strong>{todo.title}</strong>
              <small>{getAssigneeName(todo, allMembers)}</small>
            </div>
            <div className="todo-history-status">
              <span className={`todo-history-badge todo-history-badge--${todo.status}`}>
                {statusLabel(todo.status)}
              </span>
              <small>{fmtDate(todo.approvedAt ?? todo.rejectedAt ?? todo.expiresAt ?? todo.completedAt ?? new Date().toISOString())}</small>
              {todo.status === "rejected" && todo.rejectedReason && (
                <small className="todo-history-reason">{todo.rejectedReason}</small>
              )}
            </div>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button className="secondary-button" disabled={loading} onClick={loadMore} type="button">
          {loading ? "Laddar…" : "Ladda fler"}
        </button>
      )}
    </>
  );
}
