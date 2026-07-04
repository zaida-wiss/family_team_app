import "./TodosView.css";
import { CheckCircle2, List, Pencil, PlusCircle, Save, Send, Trash2, Waypoints, X, XCircle } from "lucide-react";
import { useState } from "react";
import type { Id, Member, Reward, Role, Todo } from "@shared/types";
import { TodoCreatorModal } from "./TodoCreatorModal";
import { ParentTodoThreadView } from "./ParentTodoThreadView";
import { getAssigneeName, getVisibleTodos, isTodoHistory } from "./selectors";
import { hasPermission } from "../../utils/permissions";

type Props = {
  currentMember: Member;
  members: Member[];
  allMembers: Member[];
  roles: Role[];
  todos: Todo[];
  rewards: Reward[];
  editingTodoId: Id | null;
  editingTodoTitle: string;
  canApproveTodos: boolean;
  canSeeTodos: boolean;
  wishStars: Record<Id, number>;
  onSetEditingTodoTitle: (t: string) => void;
  onStartEditingTodo: (todo: Todo) => void;
  onSaveTodoTitle: (todoId: Id) => void;
  onCancelEditingTodo: () => void;
  onCreateTodo: (todo: Todo) => void;
  onSoftDeleteTodo: (todoId: Id) => void;
  onApproveTodo: (todoId: Id) => void;
  onRejectTodo: (todoId: Id, reason: string | null) => void;
  onApproveWish: (rewardId: Id) => void;
  onRejectWish: (rewardId: Id) => void;
  onSetWishStars: (rewardId: Id, stars: number) => void;
};

function getTodoSummary(todo: { status: string; starValue: number }) {
  if (todo.status === "expired") return "Utgången";
  if (todo.status === "done") return "Väntar";
  return `${todo.starValue} stjärnor`;
}

export function TodosView({
  currentMember,
  members,
  allMembers,
  roles,
  todos,
  rewards,
  editingTodoId,
  editingTodoTitle,
  canApproveTodos,
  canSeeTodos,
  wishStars,
  onSetEditingTodoTitle,
  onStartEditingTodo,
  onSaveTodoTitle,
  onCancelEditingTodo,
  onCreateTodo,
  onSoftDeleteTodo,
  onApproveTodo,
  onRejectTodo,
  onApproveWish,
  onRejectWish,
  onSetWishStars
}: Props) {
  const visibleTodos = canSeeTodos
    ? getVisibleTodos(currentMember, roles, todos).filter((t) => !isTodoHistory(t))
    : [];
  const canCreate = hasPermission(currentMember, roles, "canCreateTodos");
  const approvalTodos = canApproveTodos ? todos.filter((t) => t.status === "done") : [];
  const suggestedRewards = canApproveTodos
    ? rewards.filter((r) => r.status === "suggested" && r.deletedAt === null)
    : [];

  const [rejectingTodoId, setRejectingTodoId] = useState<Id | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "thread">("list");

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

  return (
    <article className="dashboard">
      <header className="section-header">
        <div>
          <p className="eyebrow">Uppgifter</p>
          <h2>Todos</h2>
        </div>
      </header>

      <div className="dashboard-list">
        {canCreate && (
          <button
            className="primary-button"
            onClick={() => setIsCreateModalOpen(true)}
            type="button"
          >
            <PlusCircle size={18} />
            Skapa todo
          </button>
        )}

        {isCreateModalOpen && (
          <TodoCreatorModal
            currentMember={currentMember}
            members={members}
            roles={roles}
            onCreateTodo={onCreateTodo}
            onClose={() => setIsCreateModalOpen(false)}
          />
        )}

        {canSeeTodos && visibleTodos.length > 0 && (
          <div className="todo-view-toggle" role="group" aria-label="Visningsläge för todos">
            <button
              type="button"
              className={`icon-button${viewMode === "list" ? " active" : ""}`}
              aria-pressed={viewMode === "list"}
              onClick={() => setViewMode("list")}
              title="Lista"
            >
              <List size={16} /> Lista
            </button>
            <button
              type="button"
              className={`icon-button${viewMode === "thread" ? " active" : ""}`}
              aria-pressed={viewMode === "thread"}
              onClick={() => setViewMode("thread")}
              title="Bollar i tråd"
            >
              <Waypoints size={16} /> Bollar i tråd
            </button>
          </div>
        )}

        {viewMode === "thread" && canSeeTodos && visibleTodos.length > 0 && (
          <ParentTodoThreadView todos={visibleTodos} members={allMembers} />
        )}

        {viewMode === "list" && visibleTodos.map((todo) => {
          const isEditing = editingTodoId === todo.id;
          return (
            <div className="dashboard-row todo-dashboard-row" key={todo.id}>
              <CheckCircle2 size={18} />
              {isEditing ? (
                <input
                  className="text-input todo-title-input"
                  onChange={(e) => onSetEditingTodoTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveTodoTitle(todo.id);
                    if (e.key === "Escape") onCancelEditingTodo();
                  }}
                  value={editingTodoTitle}
                />
              ) : (
                <span>
                  {todo.title}
                  <small>{getAssigneeName(todo, allMembers)}</small>
                </span>
              )}
              <strong>{getTodoSummary(todo)}</strong>
              <div className="todo-row-actions">
                {isEditing ? (
                  <>
                    <button className="icon-button" onClick={() => onSaveTodoTitle(todo.id)} title="Spara" type="button">
                      <Save size={16} />
                    </button>
                    <button className="icon-button" onClick={onCancelEditingTodo} title="Avbryt" type="button">
                      <XCircle size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="icon-button" onClick={() => onStartEditingTodo(todo)} title="Redigera" type="button">
                      <Pencil size={16} />
                    </button>
                    <button className="icon-button danger" onClick={() => onSoftDeleteTodo(todo.id)} title="Radera" type="button">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}

        {visibleTodos.length === 0 && !canCreate && (
          <p className="empty-note">Inga todos att visa.</p>
        )}

        {approvalTodos.length > 0 && (
          <section className="approval-panel" aria-label="Uppgifter att godkänna">
            <div className="approval-header">
              <strong>Väntar på godkännande</strong>
              <span>{approvalTodos.length}</span>
            </div>
            {approvalTodos.map((todo) => (
              <div className="approval-row" key={todo.id}>
                <div>
                  <strong>{todo.title}</strong>
                  <small>
                    {getAssigneeName(todo, allMembers)} · {todo.starValue} stjärnor om den godkänns
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
                      <Send size={16} />
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

        {suggestedRewards.length > 0 && (
          <section className="approval-panel" aria-label="Önskningar att godkänna">
            <div className="approval-header">
              <strong>Önskningar</strong>
              <span>{suggestedRewards.length}</span>
            </div>
            {suggestedRewards.map((reward) => (
              <div className="approval-row" key={reward.id}>
                <div>
                  <strong>{reward.title}</strong>
                  <small>
                    <input
                      aria-label="Antal stjärnor"
                      className="stars-input"
                      max={100}
                      min={1}
                      onChange={(e) => onSetWishStars(reward.id, Number(e.target.value))}
                      type="number"
                      value={wishStars[reward.id] ?? 10}
                    />{" "}
                    stjärnor
                  </small>
                </div>
                <div className="approval-actions">
                  <button className="icon-button" onClick={() => onApproveWish(reward.id)} title="Godkänn" type="button">
                    <CheckCircle2 size={16} />
                  </button>
                  <button className="icon-button danger" onClick={() => onRejectWish(reward.id)} title="Neka" type="button">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </article>
  );
}
