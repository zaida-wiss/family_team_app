import type { ComponentProps } from "react";
import { ChildDashboard } from "../children/ChildDashboard";
import { Dashboard } from "./Dashboard";
import { MemberOverview } from "../layout/MemberOverview";
import { CalendarPanel } from "../calendars/CalendarPanel";
import { ShoppingListsPanel } from "../shopping/ShoppingListsPanel";
import { canManageChildAccount } from "../../utils/permissions";
import { getRewardPathProgress, getVisibleTodos } from "../todos/selectors";
import type { ShellPanel } from "../../hooks/useAppState";
import type { Calendar, Member, Reward, Role, ShoppingList, Todo } from "@shared/types";

type DashboardProps = ComponentProps<typeof Dashboard>;

type Props = {
  activePanel: ShellPanel;
  accountName: string;
  currentMember: Member;
  activeMembers: Member[];
  selectedDashboardMemberId: string | null;
  roles: Role[];
  todos: Todo[];
  rewards: Reward[];
  calendars: Calendar[];
  shoppingLists: ShoppingList[];
  canSeeCalendar: boolean;
  canSeeTodos: boolean;
  canSeeShopping: boolean;
  canApproveTodos: boolean;
  canManageMembers: boolean;
  isParent: boolean;
  editingTodoId: string | null;
  editingTodoTitle: string;
  wishStars: Record<string, number>;
  wishTitle: string;
  onNavigate: (panel: ShellPanel) => void;
  onSelectMember: (id: string) => void;
  onSetEditingTodoTitle: (t: string) => void;
  onStartEditingTodo: (todo: Todo) => void;
  onSaveTodoTitle: (todoId: string) => void;
  onCancelEditingTodo: () => void;
  onCreateTodo: (todo: Todo) => void;
  onSoftDeleteTodo: (todoId: string) => void;
  onApproveTodo: (todoId: string) => void;
  onRejectTodo: (todoId: string) => void;
  onApproveWish: (rewardId: string) => void;
  onRejectWish: (rewardId: string) => void;
  onSetWishStars: (rewardId: string, stars: number) => void;
  onAddCalendarEvent: DashboardProps["onAddCalendarEvent"];
  onCreateCalendar: (name: string) => void;
  onImportCalendar: DashboardProps["onImportCalendar"];
  onShareCalendar: DashboardProps["onShareCalendar"];
  onRemoveCalendarShare: (calendarId: string, memberId: string) => void;
  onAddShoppingItem: (listId: string, title: string) => void;
  onCreateShoppingList: (name: string) => void;
  onDeleteShoppingList: (listId: string) => void;
  onShareShoppingList: DashboardProps["onShareShoppingList"];
  onRemoveShoppingListShare: (listId: string, memberId: string) => void;
  onToggleShoppingItem: (listId: string, itemId: string) => void;
  onThemePickerOpen: (memberId: string) => void;
  onCompleteTodo: (member: Member, todoId: string, roles: Role[]) => void;
  onDismissRejectedTodo: (todoId: string, memberId: string) => void;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: string) => void;
};

function isTodoVisibleNow(
  todo: { visibleFrom: string | null; expiresAt: string | null },
  now: number
) {
  const from = todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
  const until = todo.expiresAt ? new Date(todo.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return from <= now && now < until;
}

export function MemberShellContent({
  activePanel, accountName,
  currentMember, activeMembers, selectedDashboardMemberId, roles,
  todos, rewards, calendars, shoppingLists,
  canSeeCalendar, canSeeTodos, canSeeShopping, canApproveTodos, canManageMembers, isParent,
  editingTodoId, editingTodoTitle, wishStars, wishTitle,
  onNavigate, onSelectMember, onSetEditingTodoTitle, onStartEditingTodo, onSaveTodoTitle,
  onCancelEditingTodo, onCreateTodo, onSoftDeleteTodo, onApproveTodo, onRejectTodo,
  onApproveWish, onRejectWish, onSetWishStars, onAddCalendarEvent, onCreateCalendar,
  onImportCalendar, onShareCalendar, onRemoveCalendarShare, onAddShoppingItem,
  onCreateShoppingList, onDeleteShoppingList, onShareShoppingList, onRemoveShoppingListShare,
  onToggleShoppingItem, onThemePickerOpen, onCompleteTodo, onDismissRejectedTodo,
  onSetWishTitle, onCreateWish
}: Props) {

  // ── Full-page calendar panel ──────────────────────────────────────────────
  if (activePanel === "calendar") {
    return (
      <CalendarPanel
        calendars={canSeeCalendar ? calendars : []}
        currentMember={currentMember}
        members={activeMembers}
        roles={roles}
        onAddEvent={onAddCalendarEvent}
        onCreateCalendar={onCreateCalendar}
        onImportCalendar={onImportCalendar}
        onShareCalendar={onShareCalendar}
        onRemoveCalendarShare={onRemoveCalendarShare}
      />
    );
  }

  // ── Full-page shopping panel ──────────────────────────────────────────────
  if (activePanel === "shopping") {
    return (
      <ShoppingListsPanel
        currentMember={currentMember}
        members={activeMembers}
        roles={roles}
        shoppingLists={canSeeShopping ? shoppingLists : []}
        onAddItem={onAddShoppingItem}
        onCreateList={onCreateShoppingList}
        onDeleteList={onDeleteShoppingList}
        onShareList={onShareShoppingList}
        onRemoveListShare={onRemoveShoppingListShare}
        onToggleItem={onToggleShoppingItem}
      />
    );
  }

  // ── Full-page todos panel: reuse Dashboard forced to todo tab ─────────────
  if (activePanel === "todos") {
    return (
      <Dashboard
        member={currentMember}
        members={activeMembers}
        roles={roles}
        todos={canSeeTodos ? getVisibleTodos(currentMember, roles, todos) : []}
        editingTodoId={editingTodoId}
        editingTodoTitle={editingTodoTitle}
        approvalTodos={canApproveTodos ? todos.filter((t) => t.status === "done") : []}
        allSuggestedRewards={canApproveTodos ? rewards.filter((r) => r.status === "suggested" && r.deletedAt === null) : []}
        wishStars={wishStars}
        canApprove={canApproveTodos}
        canSeeCalendar={false}
        canSeeTodos={canSeeTodos}
        canSeeShopping={false}
        calendars={[]}
        shoppingLists={[]}
        initialTab="todo"
        onSetEditingTodoTitle={onSetEditingTodoTitle}
        onStartEditingTodo={(todo) => onStartEditingTodo(todo)}
        onSaveTodoTitle={(todoId) => onSaveTodoTitle(todoId)}
        onCancelEditingTodo={onCancelEditingTodo}
        onCreateTodo={onCreateTodo}
        onSoftDeleteTodo={(todoId) => onSoftDeleteTodo(todoId)}
        onApproveTodo={(todoId) => onApproveTodo(todoId)}
        onRejectTodo={(todoId) => onRejectTodo(todoId)}
        onApproveWish={(rewardId) => onApproveWish(rewardId)}
        onRejectWish={(rewardId) => onRejectWish(rewardId)}
        onSetWishStars={(rewardId, stars) => onSetWishStars(rewardId, stars)}
        onAddCalendarEvent={onAddCalendarEvent}
        onCreateCalendar={onCreateCalendar}
        onImportCalendar={onImportCalendar}
        onShareCalendar={onShareCalendar}
        onRemoveCalendarShare={onRemoveCalendarShare}
        onAddShoppingItem={onAddShoppingItem}
        onCreateShoppingList={onCreateShoppingList}
        onDeleteShoppingList={(listId) => onDeleteShoppingList(listId)}
        onShareShoppingList={onShareShoppingList}
        onRemoveShoppingListShare={onRemoveShoppingListShare}
        onToggleShoppingItem={onToggleShoppingItem}
        onThemePickerOpen={onThemePickerOpen}
      />
    );
  }

  // ── Home panel ────────────────────────────────────────────────────────────
  const selectedDashboardMember =
    activeMembers.find((m) => m.id === selectedDashboardMemberId) ?? null;

  // If a member is selected, show their personal dashboard
  if (selectedDashboardMember) {
    const now = Date.now();
    const isSelectedChild = selectedDashboardMember.isChild;
    const viewedAdult = isSelectedChild ? currentMember : selectedDashboardMember;
    const activeReward = isSelectedChild
      ? (rewards.find((r) => r.wishedBy === selectedDashboardMember.id && r.status === "active") ?? null)
      : null;
    const rewardProgress =
      isSelectedChild && activeReward
        ? getRewardPathProgress(selectedDashboardMember, activeReward, todos)
        : null;
    const suggestedRewards = isSelectedChild
      ? rewards.filter((r) => r.wishedBy === selectedDashboardMember.id && r.status === "suggested")
      : [];
    const activeChildTodos = isSelectedChild
      ? todos.filter(
          (t) =>
            t.assignedTo === selectedDashboardMember.id &&
            t.status === "pending" &&
            t.recurrence.type === "none" &&
            t.deletedAt === null &&
            isTodoVisibleNow(t, now)
        )
      : [];
    const canApprove =
      isSelectedChild &&
      canManageChildAccount(currentMember, selectedDashboardMember, roles) &&
      canApproveTodos;

    return (
      <section className="dashboard-grid">
        <Dashboard
          member={viewedAdult}
          members={activeMembers}
          roles={roles}
          todos={canSeeTodos ? getVisibleTodos(viewedAdult, roles, todos) : []}
          editingTodoId={editingTodoId}
          editingTodoTitle={editingTodoTitle}
          approvalTodos={canApproveTodos ? todos.filter((t) => t.status === "done") : []}
          allSuggestedRewards={canApproveTodos ? rewards.filter((r) => r.status === "suggested" && r.deletedAt === null) : []}
          wishStars={wishStars}
          canApprove={canApprove}
          canSeeCalendar={canSeeCalendar}
          canSeeTodos={canSeeTodos}
          canSeeShopping={canSeeShopping}
          calendars={canSeeCalendar ? calendars : []}
          shoppingLists={canSeeShopping ? shoppingLists : []}
          onSetEditingTodoTitle={onSetEditingTodoTitle}
          onStartEditingTodo={(todo) => onStartEditingTodo(todo)}
          onSaveTodoTitle={(todoId) => onSaveTodoTitle(todoId)}
          onCancelEditingTodo={onCancelEditingTodo}
          onCreateTodo={onCreateTodo}
          onSoftDeleteTodo={(todoId) => onSoftDeleteTodo(todoId)}
          onApproveTodo={(todoId) => onApproveTodo(todoId)}
          onRejectTodo={(todoId) => onRejectTodo(todoId)}
          onApproveWish={(rewardId) => onApproveWish(rewardId)}
          onRejectWish={(rewardId) => onRejectWish(rewardId)}
          onSetWishStars={(rewardId, stars) => onSetWishStars(rewardId, stars)}
          onAddCalendarEvent={onAddCalendarEvent}
          onCreateCalendar={onCreateCalendar}
          onImportCalendar={onImportCalendar}
          onShareCalendar={onShareCalendar}
          onRemoveCalendarShare={onRemoveCalendarShare}
          onAddShoppingItem={onAddShoppingItem}
          onCreateShoppingList={onCreateShoppingList}
          onDeleteShoppingList={(listId) => onDeleteShoppingList(listId)}
          onShareShoppingList={onShareShoppingList}
          onRemoveShoppingListShare={onRemoveShoppingListShare}
          onToggleShoppingItem={onToggleShoppingItem}
          onThemePickerOpen={onThemePickerOpen}
        />

        {isSelectedChild ? (
          <ChildDashboard
            child={selectedDashboardMember}
            activeReward={activeReward}
            rewardProgress={rewardProgress}
            suggestedRewards={suggestedRewards}
            activeChildTodos={activeChildTodos}
            wishTitle={wishTitle}
            onSetWishTitle={onSetWishTitle}
            onCreateWish={onCreateWish}
            onCompleteTodo={(todoId) => onCompleteTodo(selectedDashboardMember, todoId, roles)}
            onDismissRejectedTodo={(todoId) => onDismissRejectedTodo(todoId, selectedDashboardMember.id)}
            onThemePickerOpen={onThemePickerOpen}
          />
        ) : null}
      </section>
    );
  }

  // No member selected → show redesigned overview
  const children = activeMembers.filter((m) => m.isChild);
  return (
    <>
      <MemberOverview
        currentMember={currentMember}
        accountName={accountName}
        roles={roles}
        activeMembers={activeMembers}
        selectedMemberId=""
        calendars={canSeeCalendar ? calendars : []}
        canSeeCalendar={canSeeCalendar}
        onSelectMember={onSelectMember}
        onOpenCalendar={() => onNavigate("calendar")}
      />
      {children.length === 0 && canManageMembers && (
        <article className="dashboard" style={{ marginTop: "18px" }}>
          <header className="section-header">
            <div><p className="eyebrow">Familj</p><h2>Lägg till barn</h2></div>
          </header>
          <p className="empty-note">Öppna inställningar för att bjuda in ett barn.</p>
        </article>
      )}
    </>
  );
}
