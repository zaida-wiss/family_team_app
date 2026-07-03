import "./TodoHistory.css";
import type { Member, Role, Todo } from "@shared/types";
import { getAssigneeName, getTodoHistory } from "./selectors";

type Props = {
  currentMember: Member;
  roles: Role[];
  todos: Todo[];
  allMembers: Member[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}

export function TodoHistory({ currentMember, roles, todos, allMembers }: Props) {
  const history = getTodoHistory(currentMember, roles, todos);

  if (history.length === 0) {
    return <p className="empty-note">Ingen historik än.</p>;
  }

  return (
    <ul className="todo-history-list" aria-label="Todo-historik">
      {history.map((todo) => (
        <li className="todo-history-row" key={todo.id}>
          <div className="todo-history-info">
            <strong>{todo.title}</strong>
            <small>{getAssigneeName(todo, allMembers)}</small>
          </div>
          <div className="todo-history-status">
            <span className={`todo-history-badge todo-history-badge--${todo.status}`}>
              {todo.status === "approved" ? "Godkänd" : "Nekad"}
            </span>
            <small>{fmtDate(todo.approvedAt ?? todo.rejectedAt ?? todo.completedAt ?? new Date().toISOString())}</small>
            {todo.status === "rejected" && todo.rejectedReason && (
              <small className="todo-history-reason">{todo.rejectedReason}</small>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
