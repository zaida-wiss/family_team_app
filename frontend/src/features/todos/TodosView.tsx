import "./TodosView.css";
import { CheckCircle2, Pencil, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import type { Id, Member, Reward, Role, Todo, TodoCategory, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask, TodoThreadRange, TodoViewMode } from "@shared/types";
import { TodoCreatorModal } from "./TodoCreatorModal";
import { TodoEditModal } from "./TodoEditModal";
import { ParentTodoThreadView } from "./ParentTodoThreadView";
import { getAssigneeName, getVisibleTodos, isTodoHistory } from "./selectors";
import { isRecurringTemplate } from "./recurringTodos";
import { hasPermission } from "../../utils/permissions";

type Props = {
  currentMember: Member;
  members: Member[];
  allMembers: Member[];
  roles: Role[];
  todos: Todo[];
  rewards: Reward[];
  canApproveTodos: boolean;
  canSeeTodos: boolean;
  fixedTodoTimes: boolean;
  wishStars: Record<Id, number>;
  // Visningsläget (lista/tråd) väljs i Inställningar (2026-07-05, Zaidas
  // beslut) — ingen egen växlare i panelen, bara kategori/+-knappen/todos syns.
  todoViewMode: TodoViewMode;
  todoThreadOrder: Id[];
  onReorderThreads: (order: Id[]) => void;
  // Hur mycket som visas i tråd-vyn (2026-07-06, Zaidas önskemål) — väljs i
  // Inställningar, samma mönster som todoViewMode.
  todoThreadRange: TodoThreadRange;
  onCreateTodo: (todo: Todo) => void;
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onToggleTodoInProgress: (todoId: Id, targetMemberId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  onCompleteTodo: (todoId: Id) => void;
  personalCategories: TodoCategory[];
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onRenameCategory: (id: Id, name: string) => void;
  onRemoveCategory: (id: Id) => void;
  onSetCategoryHidden: (id: Id, hidden: boolean) => void;
  taskTemplates: TodoTemplate[];
  categoryTemplates: TodoCategoryTemplate[];
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onCreateCategoryTemplate: (name: string, tasks: TodoTemplateTask[]) => Promise<TodoCategoryTemplate>;
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
  canApproveTodos,
  canSeeTodos,
  fixedTodoTimes,
  wishStars,
  todoViewMode,
  todoThreadOrder,
  onReorderThreads,
  todoThreadRange,
  onCreateTodo,
  onToggleSubtask,
  onToggleTodoInProgress,
  onUpdateTodo,
  onRefreshRoutine,
  onCompleteTodo,
  personalCategories,
  onCreateCategory,
  onRenameCategory,
  onRemoveCategory,
  onSetCategoryHidden,
  taskTemplates,
  categoryTemplates,
  onCreateTaskTemplate,
  onCreateCategoryTemplate,
  onSoftDeleteTodo,
  onApproveWish,
  onRejectWish,
  onSetWishStars
}: Props) {
  // Återkommande MALLAR ska aldrig visas som en egen rad/boll — bara deras
  // dagliga occurrence gör det (samma exkludering som barnens egen dashboard,
  // se ChildShellContent.tsx). Utan detta syntes mallen som en till synes
  // duplicerad todo bredvid sin egen occurrence (Zaida, 2026-07-06).
  const visibleTodos = canSeeTodos
    ? getVisibleTodos(currentMember, roles, todos).filter((t) => !isTodoHistory(t) && !isRecurringTemplate(t))
    : [];
  const canCreate = hasPermission(currentMember, roles, "canCreateTodos");
  const suggestedRewards = canApproveTodos
    ? rewards.filter((r) => r.status === "suggested" && r.deletedAt === null)
    : [];

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Sätts när "Lägg till uppgift" väljs från en kategoris meny (2026-07-05) —
  // förvalt i skapa-modalen, fortsatt ändringsbart där.
  const [createDefaultCategoryId, setCreateDefaultCategoryId] = useState<Id | null>(null);
  // Listläget öppnar nu samma fullständiga redigera-modal som tråd-vyn
  // (2026-07-06, Zaidas fråga om var man rättar ett fel datum) — ersätter den
  // gamla inline-titel-redigeringen, som inte kunde ändra Syns från/Försvinner
  // och därför var en återvändsgränd om en engångsuppgift råkat få fel datum
  // och därmed blivit osynlig i tråd-vyn (den enda andra platsen redigera-
  // modalen nåddes ifrån).
  const [editTodoId, setEditTodoId] = useState<Id | null>(null);
  const editTodo = todos.find((t) => t.id === editTodoId) ?? null;

  function openCreateModalForCategory(categoryId: Id | null) {
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
            kategori/todouppgifterna. Den fristående +-knappen togs bort
            2026-07-06 (Zaidas beslut) — nya uppgifter/kategorier skapas nu
            enbart via en trådens egen "Lägg till uppgift"-menyval istället
            (kategorierna eller den gemensamma Barn-tråden). */}
        {isCreateModalOpen && (
          <TodoCreatorModal
            currentMember={currentMember}
            members={members}
            roles={roles}
            categories={personalCategories}
            defaultCategoryId={createDefaultCategoryId}
            onCreateCategory={onCreateCategory}
            onCreateTodo={onCreateTodo}
            taskTemplates={taskTemplates}
            categoryTemplates={categoryTemplates}
            onClose={closeCreateModal}
            fixedTodoTimes={fixedTodoTimes}
          />
        )}

        {editTodo && (
          <TodoEditModal
            todo={editTodo}
            currentMember={currentMember}
            members={allMembers}
            roles={roles}
            categories={personalCategories}
            todos={todos}
            onUpdateTodo={onUpdateTodo}
            onCreateCategory={onCreateCategory}
            onCreateTaskTemplate={onCreateTaskTemplate}
            onDeleteTodo={onSoftDeleteTodo}
            onRefreshRoutine={onRefreshRoutine}
            onClose={() => setEditTodoId(null)}
            fixedTodoTimes={fixedTodoTimes}
          />
        )}

        {todoViewMode === "thread" && canSeeTodos && (
          <ParentTodoThreadView
            todos={visibleTodos}
            allTodos={todos}
            members={allMembers}
            roles={roles}
            currentMember={currentMember}
            categories={personalCategories}
            onToggleSubtask={onToggleSubtask}
            onToggleTodoInProgress={onToggleTodoInProgress}
            onUpdateTodo={onUpdateTodo}
            onRefreshRoutine={onRefreshRoutine}
            onCompleteTodo={onCompleteTodo}
            onCreateCategory={onCreateCategory}
            onRenameCategory={onRenameCategory}
            onRemoveCategory={onRemoveCategory}
            onSetCategoryHidden={onSetCategoryHidden}
            onCreateTaskTemplate={onCreateTaskTemplate}
            onCreateCategoryTemplate={onCreateCategoryTemplate}
            onDeleteTodo={onSoftDeleteTodo}
            onAddTodoToCategory={openCreateModalForCategory}
            todoThreadOrder={todoThreadOrder}
            onReorderThreads={onReorderThreads}
            range={todoThreadRange}
            fixedTodoTimes={fixedTodoTimes}
          />
        )}

        {todoViewMode === "list" && visibleTodos.map((todo) => (
          <div className="dashboard-row todo-dashboard-row" key={todo.id}>
            <CheckCircle2 size={18} />
            <span>
              {todo.title}
              <small>{getAssigneeName(todo, allMembers)}</small>
            </span>
            <strong>{getTodoSummary(todo)}</strong>
            <div className="todo-row-actions">
              <button className="icon-button" onClick={() => setEditTodoId(todo.id)} title="Redigera" type="button">
                <Pencil size={16} />
              </button>
              <button className="icon-button danger" onClick={() => onSoftDeleteTodo(todo.id)} title="Radera" type="button">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

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
