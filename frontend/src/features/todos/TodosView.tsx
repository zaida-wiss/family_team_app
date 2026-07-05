import "./TodosView.css";
import { CheckCircle2, Pencil, Plus, Save, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import type { Id, Member, Reward, Role, Todo, TodoCategory, TodoViewMode } from "@shared/types";
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
  // Visningsläget (lista/tråd) väljs i Inställningar (2026-07-05, Zaidas
  // beslut) — ingen egen växlare i panelen, bara kategori/+-knappen/todos syns.
  todoViewMode: TodoViewMode;
  onSetEditingTodoTitle: (t: string) => void;
  onStartEditingTodo: (todo: Todo) => void;
  onSaveTodoTitle: (todoId: Id) => void;
  onCancelEditingTodo: () => void;
  onCreateTodo: (todo: Todo) => void;
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onCompleteTodo: (todoId: Id) => void;
  personalCategories: TodoCategory[];
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onRenameCategory: (id: Id, name: string) => void;
  onRemoveCategory: (id: Id) => void;
  onSetCategoryHidden: (id: Id, hidden: boolean) => void;
  onSoftDeleteTodo: (todoId: Id) => void;
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
  todoViewMode,
  onSetEditingTodoTitle,
  onStartEditingTodo,
  onSaveTodoTitle,
  onCancelEditingTodo,
  onCreateTodo,
  onToggleSubtask,
  onUpdateTodo,
  onCompleteTodo,
  personalCategories,
  onCreateCategory,
  onRenameCategory,
  onRemoveCategory,
  onSetCategoryHidden,
  onSoftDeleteTodo,
  onApproveWish,
  onRejectWish,
  onSetWishStars
}: Props) {
  const visibleTodos = canSeeTodos
    ? getVisibleTodos(currentMember, roles, todos).filter((t) => !isTodoHistory(t))
    : [];
  const canCreate = hasPermission(currentMember, roles, "canCreateTodos");
  const suggestedRewards = canApproveTodos
    ? rewards.filter((r) => r.status === "suggested" && r.deletedAt === null)
    : [];

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Sätts när "Lägg till uppgift" väljs från en kategoris meny (2026-07-05) —
  // förvalt i skapa-modalen, fortsatt ändringsbart där.
  const [createDefaultCategoryId, setCreateDefaultCategoryId] = useState<Id | null>(null);

  function openCreateModalForCategory(categoryId: Id) {
    setCreateDefaultCategoryId(categoryId);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateDefaultCategoryId(null);
  }

  return (
    <article className="dashboard">
      <header className="section-header">
        {todoViewMode === "thread" ? (
          <div className="todos-bubble-header">
            <h2 className="todos-bubble-header__title">Bubbelsysslor ✨</h2>
            <p className="todos-bubble-header__subtitle">
              Dagens familjebubblor – pilla på en när den är klar!
            </p>
          </div>
        ) : (
          <div>
            <p className="eyebrow">Uppgifter</p>
            <h2>Todos</h2>
          </div>
        )}
      </header>

      <div className="dashboard-list">
        {/* Visningsläget (lista/tråd) väljs i Inställningar, ingen egen
            växlare här (2026-07-05, Zaidas beslut) — panelen visar bara
            kategori/+-knappen/todouppgifterna. */}
        {canSeeTodos && canCreate && (
          <div className="todo-view-toggle" role="group" aria-label="Todos-åtgärder">
            <button
              type="button"
              className="icon-button"
              onClick={() => setIsCreateModalOpen(true)}
              title="Ny uppgift"
            >
              <Plus size={16} />
            </button>
          </div>
        )}

        {isCreateModalOpen && (
          <TodoCreatorModal
            currentMember={currentMember}
            members={members}
            roles={roles}
            categories={personalCategories}
            defaultCategoryId={createDefaultCategoryId}
            onCreateCategory={onCreateCategory}
            onCreateTodo={onCreateTodo}
            onClose={closeCreateModal}
          />
        )}

        {todoViewMode === "thread" && canSeeTodos && (
          <ParentTodoThreadView
            todos={visibleTodos}
            members={allMembers}
            roles={roles}
            currentMember={currentMember}
            categories={personalCategories}
            onToggleSubtask={onToggleSubtask}
            onUpdateTodo={onUpdateTodo}
            onCompleteTodo={onCompleteTodo}
            onCreateCategory={onCreateCategory}
            onRenameCategory={onRenameCategory}
            onRemoveCategory={onRemoveCategory}
            onSetCategoryHidden={onSetCategoryHidden}
            onDeleteTodo={onSoftDeleteTodo}
            onAddTodoToCategory={openCreateModalForCategory}
          />
        )}

        {todoViewMode === "list" && visibleTodos.map((todo) => {
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
