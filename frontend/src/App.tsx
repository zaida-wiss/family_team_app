import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Settings,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import { setApiMemberId } from "./api";

import { AccountSettings } from "./features/accounts/AccountSettings";
import { AccountSetup } from "./features/accounts/AccountSetup";
import { useAccountState } from "./features/accounts/useAccountState";
import { useCalendarsState } from "./features/calendars/useCalendarsState";
import { MemberAvatar } from "./features/members/MemberAvatar";
import { useMembersState } from "./features/members/useMembersState";
import { useRolesState } from "./features/roles/useRolesState";
import {
  canManageChildAccount,
  hasPermission
} from "./features/roles/permissions";
import { RoleEditor } from "./features/roles/RoleEditor";
import { useShoppingState } from "./features/shopping/useShoppingState";
import { TrashView } from "./features/trash/TrashView";
import { useTodosState } from "./features/todos/useTodosState";
import { getRewardPathProgress, getVisibleTodos } from "./features/todos/selectors";
import { useRewardsState } from "./features/rewards/useRewardsState";
import { AdultDashboard } from "./features/adults/AdultDashboard";
import { ChildDashboard } from "./features/children/ChildDashboard";
import { ThemePicker } from "./components/ThemePicker";
import type { DashboardThemeId, Id } from "@shared/types";

export function App() {
  const { activeAccount, setActiveAccount } = useAccountState();
  const { roles, createRole, toggleRolePermission } = useRolesState();
  const {
    members,
    createMember,
    softDeleteMember,
    restoreMember,
    updateMemberTheme,
    updateMemberAvatar,
    assignRole,
    clearMemberAvatar
  } = useMembersState();
  const {
    todos,
    editingTodoId,
    editingTodoTitle,
    setEditingTodoTitle,
    createTodo,
    completeTodo,
    startEditingTodo,
    saveTodoTitle,
    cancelEditingTodo,
    softDeleteTodo,
    restoreTodo,
    approveTodo,
    rejectTodo,
    dismissRejectedTodo,
    softDeleteTodosForMember
  } = useTodosState();
  const {
    calendars,
    createCalendar,
    addCalendarEvent,
    importCalendarEvents,
    shareCalendar,
    removeCalendarShare,
    restoreCalendar,
    softDeleteCalendarsForMember
  } = useCalendarsState();
  const {
    shoppingLists,
    createShoppingList,
    addShoppingItem,
    shareShoppingList,
    removeShoppingListShare,
    softDeleteShoppingList,
    restoreShoppingList,
    toggleShoppingItem,
    softDeleteShoppingForMember
  } = useShoppingState();
  const { rewards, wishTitle, setWishTitle, createWish, wishStars, setWishStars, approveWish, rejectWish } = useRewardsState();

  const [selectedDashboardMemberId, setSelectedDashboardMemberId] =
    useState<Id | null>(null);
  const [themePickerMemberId, setThemePickerMemberId] = useState<Id | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const activeMembers = members.filter((member) => member.deletedAt === null);
  const currentMember = activeMembers[0];

  useEffect(() => {
    if (currentMember) {
      setApiMemberId(currentMember.id);
    }
  }, [currentMember?.id]);

  if (!currentMember) {
    return null;
  }

  const selectedDashboardMember =
    activeMembers.find((member) => member.id === selectedDashboardMemberId) ??
    currentMember;
  const selectedAdultDashboardMember = selectedDashboardMember.isChild
    ? currentMember
    : selectedDashboardMember;
  const selectedChild = selectedDashboardMember.isChild
    ? selectedDashboardMember
    : activeMembers.find((member) => member.isChild);
  const activeReward = selectedChild
    ? (rewards.find((r) => r.wishedBy === selectedChild.id && r.status === "active") ?? null)
    : null;
  const rewardProgress = selectedChild && activeReward
    ? getRewardPathProgress(selectedChild, activeReward, todos)
    : null;
  const suggestedRewards = selectedChild
    ? rewards.filter((r) => r.wishedBy === selectedChild.id && r.status === "suggested")
    : [];
  const adultTodos = getVisibleTodos(selectedAdultDashboardMember, roles, todos);
  const now = Date.now();
  const activeChildTodos = selectedChild
    ? todos.filter((todo) => {
        return (
          todo.assignedTo === selectedChild.id &&
          todo.status === "pending" &&
          todo.recurrence.type === "none" &&
          todo.deletedAt === null &&
          isTodoVisibleNow(todo, now)
        );
      })
    : [];
  const approvalTodos = todos.filter((todo) => todo.status === "done");
  const allSuggestedRewards = rewards.filter((r) => r.status === "suggested" && r.deletedAt === null);
  const canCurrentMemberApprove =
    selectedChild !== undefined &&
    canManageChildAccount(currentMember, selectedChild, roles) &&
    hasPermission(currentMember, roles, "canApproveTodos");

  const nextCalendarEvent = calendars
    .flatMap((calendar) =>
      calendar.events
        .filter((event) => event.deletedAt === null)
        .map((event) => ({ calendar, event }))
    )
    .sort(
      (first, second) =>
        new Date(first.event.startsAt).getTime() -
        new Date(second.event.startsAt).getTime()
    )[0];

  const themePickerMember = themePickerMemberId
    ? activeMembers.find((member) => member.id === themePickerMemberId)
    : null;

  function deleteOwnData() {
    const memberId = currentMember.id;
    const deletedAt = new Date().toISOString();
    clearMemberAvatar(memberId);
    softDeleteTodosForMember(memberId, deletedAt);
    softDeleteCalendarsForMember(memberId, deletedAt);
    softDeleteShoppingForMember(memberId, deletedAt);
  }

  function handleThemeSelect(memberId: Id, themeId: DashboardThemeId) {
    updateMemberTheme(memberId, themeId);
    setThemePickerMemberId(null);
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">
            {activeAccount.type === "family" ? "Familjekonto" : "Arbetsplats"}
          </p>
          <h1>{activeAccount.name}</h1>
        </div>
        <div className="account-choice">
          <span className={`choice-pill ${activeAccount.type === "family" ? "active" : ""}`}>
            <Users size={16} />
            Familj
          </span>
          <span className={`choice-pill ${activeAccount.type === "workplace" ? "active" : ""}`}>
            <BriefcaseBusiness size={16} />
            Arbetsplats
          </span>
        </div>
        {!currentMember.isChild && (
          <button
            className={`icon-button settings-nav-button ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings((prev) => !prev)}
            title="Inställningar"
            type="button"
          >
            <Settings size={22} />
          </button>
        )}
      </section>

      <AccountSetup account={activeAccount} onUpdateAccount={setActiveAccount} />

      <AccountSettings
        account={activeAccount}
        currentMember={currentMember}
        members={members}
        roles={roles}
        onCreateMember={createMember}
        onDeleteMember={(memberId) => softDeleteMember(memberId, currentMember.id)}
        onDeleteOwnData={deleteOwnData}
        onUpdateMemberAvatar={updateMemberAvatar}
      />

      {showSettings ? (
        <RoleEditor
          members={members}
          roles={roles}
          onAssignRole={assignRole}
          onCreateRole={createRole}
          onTogglePermission={toggleRolePermission}
        />
      ) : null}

      {!showSettings && (
      <>
      <section className="overview-grid">
        <article className="calendar-panel">
          <header className="section-header">
            <div>
              <p className="eyebrow">Översikt</p>
              <h2>Kalender</h2>
            </div>
            <CalendarDays size={24} />
          </header>

          {nextCalendarEvent ? (
            <div className="calendar-card">
              <span className="date-chip">
                {formatDateChip(nextCalendarEvent.event.startsAt)}
              </span>
              <div>
                <h3>{nextCalendarEvent.event.title}</h3>
                <p>
                  {formatTimeRange(
                    nextCalendarEvent.event.startsAt,
                    nextCalendarEvent.event.endsAt
                  )}{" "}
                  i {nextCalendarEvent.calendar.name}
                </p>
              </div>
            </div>
          ) : (
            <p className="empty-note">Ingen kalenderhändelse inlagd.</p>
          )}
        </article>

        <article className="members-panel">
          <header className="section-header">
            <div>
              <p className="eyebrow">Medlemmar</p>
              <h2>Personliga dashboards</h2>
            </div>
            <ChevronRight size={24} />
          </header>

          <div className="member-row">
            {activeMembers.map((member) => (
              <button
                className={`member-button ${
                  selectedDashboardMember.id === member.id ? "active" : ""
                }`}
                key={member.id}
                onClick={() => setSelectedDashboardMemberId(member.id)}
                type="button"
              >
                <MemberAvatar member={member} showArchedName />
                <span className="member-name-fallback">{member.name}</span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <AdultDashboard
          member={selectedAdultDashboardMember}
          members={activeMembers}
          roles={roles}
          todos={adultTodos}
          editingTodoId={editingTodoId}
          editingTodoTitle={editingTodoTitle}
          approvalTodos={approvalTodos}
          allSuggestedRewards={allSuggestedRewards}
          wishStars={wishStars}
          canApprove={canCurrentMemberApprove}
          calendars={calendars}
          shoppingLists={shoppingLists}
          onSetEditingTodoTitle={setEditingTodoTitle}
          onStartEditingTodo={(todo) => startEditingTodo(todo, selectedAdultDashboardMember, roles)}
          onSaveTodoTitle={(todoId) => saveTodoTitle(todoId, selectedAdultDashboardMember, roles)}
          onCancelEditingTodo={cancelEditingTodo}
          onCreateTodo={createTodo}
          onSoftDeleteTodo={(todoId) => softDeleteTodo(todoId, selectedAdultDashboardMember, roles)}
          onApproveTodo={(todoId) => approveTodo(todoId, currentMember.id)}
          onRejectTodo={(todoId) => rejectTodo(todoId, currentMember.id)}
          onApproveWish={(rewardId) => approveWish(rewardId, currentMember.id)}
          onRejectWish={(rewardId) => rejectWish(rewardId, currentMember.id)}
          onSetWishStars={(rewardId, stars) => setWishStars((prev) => ({ ...prev, [rewardId]: stars }))}
          onAddCalendarEvent={(calendarId, event) => addCalendarEvent(calendarId, event, selectedAdultDashboardMember.id)}
          onCreateCalendar={(name) => createCalendar(name, selectedAdultDashboardMember.id)}
          onImportCalendar={(calendarId, sourceName, events) => importCalendarEvents(calendarId, sourceName, events, selectedAdultDashboardMember.id)}
          onRemoveCalendarShare={removeCalendarShare}
          onShareCalendar={shareCalendar}
          onAddShoppingItem={(listId, title) => addShoppingItem(listId, title, selectedAdultDashboardMember.id)}
          onCreateShoppingList={(name) => createShoppingList(name, selectedAdultDashboardMember.id)}
          onDeleteShoppingList={(listId) => softDeleteShoppingList(listId, selectedAdultDashboardMember.id)}
          onRemoveShoppingListShare={removeShoppingListShare}
          onShareShoppingList={shareShoppingList}
          onToggleShoppingItem={toggleShoppingItem}
          onThemePickerOpen={setThemePickerMemberId}
        />

        {activeAccount.type === "family" && selectedChild ? (
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
        ) : (
          <article className="workplace-dashboard">
            <header className="section-header">
              <div>
                <p className="eyebrow">Arbetsplats</p>
                <h2>Teamvy</h2>
              </div>
              <BriefcaseBusiness size={24} />
            </header>

            <div className="workplace-note">
              <strong>Barnfunktioner är avstängda som standard.</strong>
              <p>Kontot fokuserar på medlemmar, roller, kalender, todo och inköp.</p>
            </div>
          </article>
        )}
      </section>
      </>
      )}

      <TrashView
        calendars={calendars}
        currentMember={currentMember}
        members={members}
        roles={roles}
        shoppingLists={shoppingLists}
        todos={todos}
        onRestoreCalendar={restoreCalendar}
        onRestoreMember={restoreMember}
        onRestoreShoppingList={restoreShoppingList}
        onRestoreTodo={restoreTodo}
      />

      {themePickerMember ? (
        <ThemePicker
          member={themePickerMember}
          onClose={() => setThemePickerMemberId(null)}
          onSelectTheme={(themeId) => handleThemeSelect(themePickerMember.id, themeId)}
        />
      ) : null}
    </main>
  );
}

function isTodoVisibleNow(todo: { visibleFrom: string | null; expiresAt: string | null }, now: number) {
  const visibleFromTime = todo.visibleFrom
    ? new Date(todo.visibleFrom).getTime()
    : Number.NEGATIVE_INFINITY;
  const expiresAtTime = todo.expiresAt
    ? new Date(todo.expiresAt).getTime()
    : Number.POSITIVE_INFINITY;

  return visibleFromTime <= now && now < expiresAtTime;
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
}

function formatDateChip(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short"
  }).format(new Date(value));
}
