import {
  CalendarDays,
  CheckCircle2,
  ListTodo,
  Pencil,
  Save,
  ShoppingCart,
  XCircle,
  Trash2
} from "lucide-react";
import { useState, type ComponentProps } from "react";
import type { Id, Member, Reward, Role, ShoppingList, Calendar, Todo } from "@shared/types";
import { CalendarPanel } from "../calendars/CalendarPanel";
import { ShoppingListsPanel } from "../shopping/ShoppingListsPanel";
import { TodoCreator } from "../todos/TodoCreator";

type DashboardTab = "calendar" | "todo" | "shopping";

type Props = {
  member: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  editingTodoId: Id | null;
  editingTodoTitle: string;
  approvalTodos: Todo[];
  allSuggestedRewards: Reward[];
  wishStars: Record<Id, number>;
  canApprove: boolean;
  canSeeCalendar: boolean;
  canSeeTodos: boolean;
  canSeeShopping: boolean;
  calendars: Calendar[];
  shoppingLists: ShoppingList[];
  onSetEditingTodoTitle: (title: string) => void;
  onStartEditingTodo: (todo: Todo) => void;
  onSaveTodoTitle: (todoId: Id) => void;
  onCancelEditingTodo: () => void;
  onCreateTodo: (todo: Todo) => void;
  onSoftDeleteTodo: (todoId: Id) => void;
  onApproveTodo: (todoId: Id) => void;
  onRejectTodo: (todoId: Id) => void;
  onApproveWish: (rewardId: Id) => void;
  onRejectWish: (rewardId: Id) => void;
  onSetWishStars: (rewardId: Id, stars: number) => void;
  onAddCalendarEvent: ComponentProps<typeof CalendarPanel>["onAddEvent"];
  onCreateCalendar: (name: string) => void;
  onImportCalendar: ComponentProps<typeof CalendarPanel>["onImportCalendar"];
  onRemoveCalendarShare: (calendarId: Id, memberId: Id) => void;
  onShareCalendar: (calendarId: Id, memberId: Id, access: "view" | "edit") => void;
  onAddShoppingItem: (listId: Id, title: string) => void;
  onCreateShoppingList: (name: string) => void;
  onDeleteShoppingList: (listId: Id) => void;
  onRemoveShoppingListShare: (listId: Id, memberId: Id) => void;
  onShareShoppingList: (listId: Id, memberId: Id, access: "view" | "edit") => void;
  onToggleShoppingItem: (listId: Id, itemId: Id) => void;
  onThemePickerOpen: (memberId: Id) => void;
};

function getTodoSummary(todo: { status: string; starValue: number }) {
  if (todo.status === "expired") return "Utgången";
  if (todo.status === "done") return "Väntar";
  return `${todo.starValue} stjärnor`;
}

export function Dashboard({
  member,
  members,
  roles,
  todos,
  editingTodoId,
  editingTodoTitle,
  approvalTodos,
  allSuggestedRewards,
  wishStars,
  canApprove,
  canSeeCalendar,
  canSeeTodos,
  canSeeShopping,
  calendars,
  shoppingLists,
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
  onSetWishStars,
  onAddCalendarEvent,
  onCreateCalendar,
  onImportCalendar,
  onRemoveCalendarShare,
  onShareCalendar,
  onAddShoppingItem,
  onCreateShoppingList,
  onDeleteShoppingList,
  onRemoveShoppingListShare,
  onShareShoppingList,
  onToggleShoppingItem,
  onThemePickerOpen
}: Props) {
  const firstTab: DashboardTab = canSeeCalendar ? "calendar" : canSeeTodos ? "todo" : "shopping";
  const [tab, setTab] = useState<DashboardTab>(firstTab);

  return (
    <article
      className={`dashboard theme-${member.dashboardTheme ?? "clear"}`}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button, input, select")) {
          return;
        }

        let timeoutId: number;
        timeoutId = window.setTimeout(() => {
          onThemePickerOpen(member.id);
        }, 650);

        event.currentTarget.onpointerup = () => window.clearTimeout(timeoutId);
        event.currentTarget.onpointerleave = () => window.clearTimeout(timeoutId);
      }}
    >
      <header className="section-header">
        <div>
          <p className="eyebrow">Vuxen-dashboard</p>
          <h2>{member.name}</h2>
        </div>
      </header>

      <nav className="tab-row" aria-label="Vuxen-dashboard vyer">
        {canSeeCalendar && (
          <button
            className={`tab ${tab === "calendar" ? "active" : ""}`}
            onClick={() => setTab("calendar")}
            type="button"
          >
            <CalendarDays size={16} />
            Kalender
          </button>
        )}
        {canSeeTodos && (
          <button
            className={`tab ${tab === "todo" ? "active" : ""}`}
            onClick={() => setTab("todo")}
            type="button"
          >
            <ListTodo size={16} />
            Todo
          </button>
        )}
        {canSeeShopping && (
          <button
            className={`tab ${tab === "shopping" ? "active" : ""}`}
            onClick={() => setTab("shopping")}
            type="button"
          >
            <ShoppingCart size={16} />
            Inköp
          </button>
        )}
      </nav>

      {tab === "calendar" ? (
        <CalendarPanel
          calendars={calendars}
          currentMember={member}
          members={members}
          roles={roles}
          onAddEvent={onAddCalendarEvent}
          onCreateCalendar={onCreateCalendar}
          onImportCalendar={onImportCalendar}
          onRemoveCalendarShare={onRemoveCalendarShare}
          onShareCalendar={onShareCalendar}
        />
      ) : null}

      {tab === "todo" ? (
        <div className="dashboard-list">
          <TodoCreator
            currentMember={member}
            members={members}
            roles={roles}
            onCreateTodo={onCreateTodo}
          />

          {todos.map((todo) => {
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
                  <span>{todo.title}</span>
                )}

                <strong>{getTodoSummary(todo)}</strong>

                <div className="todo-row-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="icon-button"
                        onClick={() => onSaveTodoTitle(todo.id)}
                        title="Spara todo"
                        type="button"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={onCancelEditingTodo}
                        title="Avbryt"
                        type="button"
                      >
                        <XCircle size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="icon-button"
                        onClick={() => onStartEditingTodo(todo)}
                        title="Redigera todo"
                        type="button"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => onSoftDeleteTodo(todo.id)}
                        title="Flytta todo till papperskorg"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {approvalTodos.length > 0 ? (
            <section className="approval-panel" aria-label="Uppgifter att godkänna">
              <div className="approval-header">
                <strong>Väntar på godkännande</strong>
                <span>{approvalTodos.length}</span>
              </div>

              {approvalTodos.map((todo) => (
                <div className="approval-row" key={todo.id}>
                  <div>
                    <strong>{todo.title}</strong>
                    <small>{todo.starValue} stjärnor om den godkänns</small>
                  </div>
                  <div className="approval-actions">
                    <button
                      className="icon-button"
                      disabled={!canApprove}
                      onClick={() => onApproveTodo(todo.id)}
                      title="Godkänn"
                      type="button"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      disabled={!canApprove}
                      onClick={() => onRejectTodo(todo.id)}
                      title="Neka"
                      type="button"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {allSuggestedRewards.length > 0 ? (
            <section className="approval-panel" aria-label="Önskningar att godkänna">
              <div className="approval-header">
                <strong>Önskningar</strong>
                <span>{allSuggestedRewards.length}</span>
              </div>

              {allSuggestedRewards.map((reward) => (
                <div className="approval-row" key={reward.id}>
                  <div>
                    <strong>{reward.title}</strong>
                    <small>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={wishStars[reward.id] ?? 10}
                        onChange={(e) => onSetWishStars(reward.id, Number(e.target.value))}
                        aria-label="Antal stjärnor"
                        className="stars-input"
                      />
                      {" "}stjärnor
                    </small>
                  </div>
                  <div className="approval-actions">
                    <button
                      className="icon-button"
                      onClick={() => onApproveWish(reward.id)}
                      title="Godkänn"
                      type="button"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      onClick={() => onRejectWish(reward.id)}
                      title="Neka"
                      type="button"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "shopping" ? (
        <ShoppingListsPanel
          currentMember={member}
          members={members}
          roles={roles}
          shoppingLists={shoppingLists}
          onAddItem={onAddShoppingItem}
          onCreateList={onCreateShoppingList}
          onDeleteList={onDeleteShoppingList}
          onRemoveListShare={onRemoveShoppingListShare}
          onShareList={onShareShoppingList}
          onToggleItem={onToggleShoppingItem}
        />
      ) : null}
    </article>
  );
}
