import "./ChildSettings.css";
import { useState } from "react";
import { CheckCircle2, Star, X, XCircle } from "lucide-react";
import { isChildMember } from "../todos/selectors";
import { hasPermission } from "../../utils/permissions";
import type { Id, Member, Role, Todo } from "@shared/types";

// Utbruten ur ChildSettings.tsx (2026-07-28, Zaidas önskemål: "det ska vara
// en som heter godkännande av uppgifter (separat)") — en egen underkategori
// istället för en sektion inuti Barnkonton, så godkännande alltid går att
// hitta direkt utan att skrolla förbi Önskningar/Tidslinje.
type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  onApproveTodo: (todoId: Id) => void;
  onRejectTodo: (todoId: Id, reason: string | null) => void;
};

export function ChildApprovalSettings({ currentMember, members, roles, todos, onApproveTodo, onRejectTodo }: Props) {
  const [rejectingTodoId, setRejectingTodoId] = useState<Id | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  function startRejecting(todoId: Id) {
    setRejectingTodoId(todoId);
    setRejectionReason("");
  }

  function cancelRejecting() {
    setRejectingTodoId(null);
    setRejectionReason("");
  }

  function confirmRejecting(todoId: Id) {
    onRejectTodo(todoId, rejectionReason.trim() || null);
    setRejectingTodoId(null);
    setRejectionReason("");
  }

  const childMembers = members.filter(
    (member) => member.accountId === currentMember.accountId && member.deletedAt === null && isChildMember(member, roles)
  );
  const childIds = new Set(childMembers.map((child) => child.id));
  const childById = new Map(childMembers.map((child) => [child.id, child]));
  const canApprove = hasPermission(currentMember, roles, "canApproveTodos");

  const pendingTodos = todos.filter(
    (todo) => childIds.has(todo.assignedTo ?? "") && todo.status === "done" && todo.deletedAt === null
  );

  function getChildName(memberId: Id) {
    return childById.get(memberId)?.name ?? "Barn";
  }

  if (childMembers.length === 0) {
    return (
      <div className="settings-sub">
        <h3 className="settings-sub-title">Godkännande av uppgifter</h3>
        <p className="settings-sub-desc">Lägg till ett barn under Familjemedlemmar först.</p>
      </div>
    );
  }

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">Godkännande av uppgifter</h3>
      {!canApprove ? (
        <p className="settings-sub-desc">Din roll kan inte godkänna barns uppgifter.</p>
      ) : pendingTodos.length === 0 ? (
        <p className="settings-sub-desc">Inga uppgifter väntar på godkännande.</p>
      ) : (
        <section className="approval-panel child-settings-panel" aria-label="Barnens godkännanden">
          <div className="approval-header">
            <strong>Väntar</strong>
            <span>{pendingTodos.length}</span>
          </div>
          {pendingTodos.map((todo) => (
            <div className="approval-row" key={todo.id}>
              <div>
                <strong>{todo.title}</strong>
                <small>
                  <Star size={14} fill="currentColor" />
                  {getChildName(todo.assignedTo ?? "")} · {todo.starValue} stjärnor
                </small>
              </div>
              {rejectingTodoId === todo.id ? (
                <div className="approval-reject-form">
                  <input
                    autoFocus
                    className="text-input"
                    onChange={(e) => setRejectionReason(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRejecting(todo.id);
                      if (e.key === "Escape") cancelRejecting();
                    }}
                    placeholder="Varför? (valfritt)"
                    value={rejectionReason}
                  />
                  <button className="icon-button danger" onClick={() => confirmRejecting(todo.id)} title="Skicka" type="button">
                    <XCircle size={16} />
                  </button>
                  <button className="icon-button" onClick={cancelRejecting} title="Avbryt" type="button">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="approval-actions">
                  <button className="icon-button" onClick={() => onApproveTodo(todo.id)} title="Godkänn" type="button">
                    <CheckCircle2 size={16} />
                  </button>
                  <button className="icon-button danger" onClick={() => startRejecting(todo.id)} title="Neka" type="button">
                    <XCircle size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
