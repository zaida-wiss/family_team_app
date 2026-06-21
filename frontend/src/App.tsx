import { BriefcaseBusiness, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { setApiMemberId } from "./api";
import { AuthPage } from "./features/auth/AuthPage";
import { AccountPicker } from "./features/auth/AccountPicker";
import { useAuth } from "./features/auth/useAuth";
import { Dashboard } from "./features/adults/Dashboard";
import { ChildDashboard } from "./features/children/ChildDashboard";
import { SettingsPanel } from "./features/layout/SettingsPanel";
import { MemberOverview } from "./features/layout/MemberOverview";
import { ThemePicker } from "./components/ThemePicker";
import { canManageChildAccount, hasPermission } from "./features/roles/permissions";
import { getRewardPathProgress, getVisibleTodos } from "./features/todos/selectors";
import { useAppState } from "./hooks/useAppState";
import type { DashboardThemeId, Id, Membership } from "@shared/types";

export function App() {
  const { state: authState, login, register, logout, updateMemberships } = useAuth();
  const [activeMembership, setActiveMembership] = useState<Membership | null>(null);

  if (authState.status === "loading") {
    return <main className="app-shell"><p style={{ padding: "2rem" }}>Laddar…</p></main>;
  }

  if (authState.status === "unauthenticated") {
    return <AuthPage onLogin={login} onRegister={register} />;
  }

  const { user, memberships } = authState;

  if (!activeMembership) {
    if (memberships.length === 1) {
      const m = memberships[0];
      setActiveMembership(m);
      setApiMemberId(m.member.id);
      return null;
    }
    return (
      <AccountPicker
        user={user}
        memberships={memberships}
        onSelect={(m) => { setActiveMembership(m); setApiMemberId(m.member.id); }}
        onLogout={logout}
        onMembershipsUpdated={updateMemberships}
      />
    );
  }

  return (
    <AppShell
      activeMembership={activeMembership}
      onLogout={async () => { await logout(); setActiveMembership(null); }}
      onSwitchAccount={() => setActiveMembership(null)}
      onMembershipsUpdated={updateMemberships}
    />
  );
}

type ShellProps = {
  activeMembership: Membership;
  onLogout: () => Promise<void>;
  onSwitchAccount: () => void;
  onMembershipsUpdated: (memberships: Membership[]) => void;
};

function AppShell({ activeMembership, onLogout, onSwitchAccount }: ShellProps) {
  const {
    activeAccount,
    setActiveAccount,
    roles,
    createRole,
    toggleRolePermission,
    members,
    createMember,
    softDeleteMember,
    restoreMember,
    updateMemberTheme,
    updateMemberAvatar,
    assignRole,
    clearMemberAvatar,
    todosState,
    calendarsState,
    shoppingState,
    rewardsState,
    currentMember,
    activeMembers,
    selectedDashboardMemberId,
    setSelectedDashboardMemberId,
    themePickerMemberId,
    setThemePickerMemberId,
    showSettings,
    setShowSettings,
    apiError
  } = useAppState(activeMembership);

  const {
    todos, editingTodoId, editingTodoTitle, setEditingTodoTitle,
    createTodo, completeTodo, startEditingTodo, saveTodoTitle,
    cancelEditingTodo, softDeleteTodo, restoreTodo, approveTodo,
    rejectTodo, dismissRejectedTodo, softDeleteTodosForMember
  } = todosState;

  const {
    calendars, createCalendar, addCalendarEvent, importCalendarEvents,
    shareCalendar, removeCalendarShare, restoreCalendar, softDeleteCalendarsForMember
  } = calendarsState;

  const {
    shoppingLists, createShoppingList, addShoppingItem, shareShoppingList,
    removeShoppingListShare, softDeleteShoppingList, restoreShoppingList,
    toggleShoppingItem, softDeleteShoppingForMember
  } = shoppingState;

  const {
    rewards, wishTitle, setWishTitle, createWish, wishStars, setWishStars, approveWish, rejectWish
  } = rewardsState;

  const canManageMembers = hasPermission(currentMember, roles, "canManageMembers");
  const canManageRoles   = hasPermission(currentMember, roles, "canManageRoles");
  const canSeeCalendar   = hasPermission(currentMember, roles, "canSeeAllCalendar") || hasPermission(currentMember, roles, "canSeeOwnCalendar");
  const canSeeTodos      = hasPermission(currentMember, roles, "canSeeAllTodos") || hasPermission(currentMember, roles, "canSeeOwnTodos");
  const canSeeShopping   = hasPermission(currentMember, roles, "canSeeShoppingLists");
  const canViewTrash     = hasPermission(currentMember, roles, "canViewTrash");
  const canApproveTodos  = hasPermission(currentMember, roles, "canApproveTodos");
  const isParent         = !currentMember.isChild && hasPermission(currentMember, roles, "canManageChildTodos");

  const themePickerMember = themePickerMemberId
    ? activeMembers.find((m) => m.id === themePickerMemberId)
    : null;

  function handleThemeSelect(memberId: Id, themeId: DashboardThemeId) {
    updateMemberTheme(memberId, themeId);
    setThemePickerMemberId(null);
  }

  function deleteOwnData() {
    const memberId = currentMember.id;
    const deletedAt = new Date().toISOString();
    clearMemberAvatar(memberId);
    softDeleteTodosForMember(memberId, deletedAt);
    softDeleteCalendarsForMember(memberId, deletedAt);
    softDeleteShoppingForMember(memberId, deletedAt);
  }

  const errorBanner = apiError ? (
    <div className="api-error-banner" role="alert">{apiError}</div>
  ) : null;

  const heroBar = (
    <section className="hero-panel">
      <div>
        <p className="eyebrow">{activeAccount.type === "family" ? "Familjekonto" : "Arbetsplats"}</p>
        <h1>{activeAccount.name}</h1>
      </div>
      <div className="hero-actions">
        <button
          className={`icon-button settings-nav-button ${showSettings ? "active" : ""}`}
          onClick={() => setShowSettings((p) => !p)}
          title="Inställningar"
          type="button"
        >
          <Settings size={22} />
        </button>
        <button className="icon-button" onClick={onSwitchAccount} title="Byt konto" type="button">
          <LogOut size={22} />
        </button>
      </div>
    </section>
  );

  const settingsPanel = (
    <SettingsPanel
      account={activeAccount}
      currentMember={currentMember}
      members={members}
      roles={roles}
      todos={todos}
      calendars={calendars}
      shoppingLists={shoppingLists}
      canManageRoles={canManageRoles}
      canViewTrash={canViewTrash}
      onUpdateAccount={setActiveAccount}
      onCreateMember={createMember}
      onDeleteMember={(id) => softDeleteMember(id, currentMember.id)}
      onDeleteOwnData={deleteOwnData}
      onUpdateMemberAvatar={updateMemberAvatar}
      onAssignRole={assignRole}
      onCreateRole={createRole}
      onTogglePermission={toggleRolePermission}
      onRestoreCalendar={restoreCalendar}
      onRestoreMember={restoreMember}
      onRestoreShoppingList={restoreShoppingList}
      onRestoreTodo={restoreTodo}
    />
  );

  const themePicker = themePickerMember ? (
    <ThemePicker
      member={themePickerMember}
      onClose={() => setThemePickerMemberId(null)}
      onSelectTheme={(themeId) => handleThemeSelect(themePickerMember.id, themeId)}
    />
  ) : null;

  // Child view
  if (currentMember.isChild) {
    const activeReward =
      rewards.find((r) => r.wishedBy === currentMember.id && r.status === "active") ?? null;
    const rewardProgress = activeReward
      ? getRewardPathProgress(currentMember, activeReward, todos)
      : null;
    const suggestedRewards = rewards.filter(
      (r) => r.wishedBy === currentMember.id && r.status === "suggested"
    );
    const now = Date.now();
    const activeChildTodos = todos.filter(
      (t) =>
        t.assignedTo === currentMember.id &&
        t.status === "pending" &&
        t.recurrence.type === "none" &&
        t.deletedAt === null &&
        isTodoVisibleNow(t, now)
    );

    return (
      <main className={`app-shell theme-${currentMember.dashboardTheme ?? "space"}`}>
        {errorBanner}
        {heroBar}
        {showSettings ? settingsPanel : (
          <ChildDashboard
            child={currentMember}
            activeReward={activeReward}
            rewardProgress={rewardProgress}
            suggestedRewards={suggestedRewards}
            activeChildTodos={activeChildTodos}
            wishTitle={wishTitle}
            onSetWishTitle={setWishTitle}
            onCreateWish={createWish}
            onCompleteTodo={(todoId) => completeTodo(currentMember, todoId, roles)}
            onDismissRejectedTodo={(todoId) => dismissRejectedTodo(todoId, currentMember.id)}
            onThemePickerOpen={setThemePickerMemberId}
          />
        )}
        {themePicker}
      </main>
    );
  }

  // Member/admin view
  const selectedDashboardMember =
    activeMembers.find((m) => m.id === selectedDashboardMemberId) ?? currentMember;
  const viewedMember = selectedDashboardMember.isChild ? currentMember : selectedDashboardMember;
  const selectedChild = selectedDashboardMember.isChild
    ? selectedDashboardMember
    : activeMembers.find((m) => m.isChild);

  const now = Date.now();
  const activeReward = selectedChild
    ? (rewards.find((r) => r.wishedBy === selectedChild.id && r.status === "active") ?? null)
    : null;
  const rewardProgress =
    selectedChild && activeReward
      ? getRewardPathProgress(selectedChild, activeReward, todos)
      : null;
  const suggestedRewards = selectedChild
    ? rewards.filter((r) => r.wishedBy === selectedChild.id && r.status === "suggested")
    : [];
  const activeChildTodos = selectedChild
    ? todos.filter(
        (t) =>
          t.assignedTo === selectedChild.id &&
          t.status === "pending" &&
          t.recurrence.type === "none" &&
          t.deletedAt === null &&
          isTodoVisibleNow(t, now)
      )
    : [];
  const approvalTodos = canApproveTodos ? todos.filter((t) => t.status === "done") : [];
  const allSuggestedRewards = canApproveTodos
    ? rewards.filter((r) => r.status === "suggested" && r.deletedAt === null)
    : [];
  const canApprove =
    !!selectedChild &&
    canManageChildAccount(currentMember, selectedChild, roles) &&
    canApproveTodos;
  const children = activeMembers.filter((m) => m.isChild);

  return (
    <main className="app-shell">
      {errorBanner}
      {heroBar}

      {showSettings ? settingsPanel : (
        <>
          <MemberOverview
            activeMembers={activeMembers}
            selectedMemberId={selectedDashboardMember.id}
            calendars={canSeeCalendar ? calendars : []}
            canSeeCalendar={canSeeCalendar}
            onSelectMember={setSelectedDashboardMemberId}
          />

          <section className="dashboard-grid">
            <Dashboard
              member={viewedMember}
              members={activeMembers}
              roles={roles}
              todos={canSeeTodos ? getVisibleTodos(viewedMember, roles, todos) : []}
              editingTodoId={editingTodoId}
              editingTodoTitle={editingTodoTitle}
              approvalTodos={approvalTodos}
              allSuggestedRewards={allSuggestedRewards}
              wishStars={wishStars}
              canApprove={canApprove}
              canSeeCalendar={canSeeCalendar}
              canSeeTodos={canSeeTodos}
              canSeeShopping={canSeeShopping}
              calendars={canSeeCalendar ? calendars : []}
              shoppingLists={canSeeShopping ? shoppingLists : []}
              onSetEditingTodoTitle={setEditingTodoTitle}
              onStartEditingTodo={(todo) => startEditingTodo(todo, viewedMember, roles)}
              onSaveTodoTitle={(todoId) => saveTodoTitle(todoId, viewedMember, roles)}
              onCancelEditingTodo={cancelEditingTodo}
              onCreateTodo={createTodo}
              onSoftDeleteTodo={(todoId) => softDeleteTodo(todoId, viewedMember, roles)}
              onApproveTodo={(todoId) => approveTodo(todoId, currentMember.id)}
              onRejectTodo={(todoId) => rejectTodo(todoId, currentMember.id)}
              onApproveWish={(rewardId) => approveWish(rewardId, currentMember.id)}
              onRejectWish={(rewardId) => rejectWish(rewardId, currentMember.id)}
              onSetWishStars={(rewardId, stars) =>
                setWishStars((prev) => ({ ...prev, [rewardId]: stars }))
              }
              onAddCalendarEvent={(calendarId, event) =>
                addCalendarEvent(calendarId, event, viewedMember.id)
              }
              onCreateCalendar={(name) => createCalendar(name, viewedMember.id)}
              onImportCalendar={(calendarId, sourceName, events) =>
                importCalendarEvents(calendarId, sourceName, events, viewedMember.id)
              }
              onRemoveCalendarShare={removeCalendarShare}
              onShareCalendar={shareCalendar}
              onAddShoppingItem={(listId, title) => addShoppingItem(listId, title, viewedMember.id)}
              onCreateShoppingList={(name) => createShoppingList(name, viewedMember.id)}
              onDeleteShoppingList={(listId) => softDeleteShoppingList(listId, viewedMember.id)}
              onRemoveShoppingListShare={removeShoppingListShare}
              onShareShoppingList={shareShoppingList}
              onToggleShoppingItem={toggleShoppingItem}
              onThemePickerOpen={setThemePickerMemberId}
            />

            {activeAccount.type === "family" && isParent && selectedChild ? (
              <ChildDashboard
                child={selectedChild}
                activeReward={activeReward}
                rewardProgress={rewardProgress}
                suggestedRewards={suggestedRewards}
                activeChildTodos={activeChildTodos}
                wishTitle={wishTitle}
                onSetWishTitle={setWishTitle}
                onCreateWish={createWish}
                onCompleteTodo={(todoId) => completeTodo(selectedChild, todoId, roles)}
                onDismissRejectedTodo={(todoId) => dismissRejectedTodo(todoId, selectedChild.id)}
                onThemePickerOpen={setThemePickerMemberId}
              />
            ) : activeAccount.type === "family" && children.length === 0 && canManageMembers ? (
              <article className="dashboard">
                <header className="section-header">
                  <div><p className="eyebrow">Familj</p><h2>Lägg till barn</h2></div>
                </header>
                <p className="empty-note">Öppna inställningar för att lägga till barnkonton.</p>
              </article>
            ) : activeAccount.type === "workplace" ? (
              <article className="dashboard">
                <header className="section-header">
                  <div><p className="eyebrow">Arbetsplats</p><h2>Teamvy</h2></div>
                  <BriefcaseBusiness size={24} />
                </header>
                <p className="empty-note">
                  Barnfunktioner är inaktiverade. Kontot fokuserar på kalender, todo och inköp.
                </p>
              </article>
            ) : null}
          </section>
        </>
      )}

      {themePicker}
    </main>
  );
}

function isTodoVisibleNow(
  todo: { visibleFrom: string | null; expiresAt: string | null },
  now: number
) {
  const from = todo.visibleFrom ? new Date(todo.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
  const until = todo.expiresAt ? new Date(todo.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  return from <= now && now < until;
}
