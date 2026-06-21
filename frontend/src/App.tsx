import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ListTodo,
  Pencil,
  Save,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  Users,
  XCircle
} from "lucide-react";
import { useState } from "react";

import { AccountSettings } from "./features/accounts/AccountSettings";
import { AccountSetup } from "./features/accounts/AccountSetup";
import { useAccountState } from "./features/accounts/useAccountState";
import { CalendarPanel } from "./features/calendars/CalendarPanel";
import { useCalendarsState } from "./features/calendars/useCalendarsState";
import { MemberAvatar } from "./features/members/MemberAvatar";
import { useMembersState } from "./features/members/useMembersState";
import { useRolesState } from "./features/roles/useRolesState";
import {
  canManageChildAccount,
  hasPermission
} from "./features/roles/permissions";
import { RoleEditor } from "./features/roles/RoleEditor";
import { ShoppingListsPanel } from "./features/shopping/ShoppingListsPanel";
import { useShoppingState } from "./features/shopping/useShoppingState";
import { TrashView } from "./features/trash/TrashView";
import { TodoCreator } from "./features/todos/TodoCreator";
import { useTodosState } from "./features/todos/useTodosState";
import { getRewardPathProgress, getVisibleTodos } from "./features/todos/selectors";
import { ThemePicker } from "./components/ThemePicker";
import { rewards } from "./data/sampleData";
import type { DashboardThemeId, Id } from "@shared/types";

type AdultDashboardTab = "calendar" | "todo" | "shopping";

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

  const [adultTab, setAdultTab] = useState<AdultDashboardTab>("calendar");
  const [selectedDashboardMemberId, setSelectedDashboardMemberId] =
    useState<Id | null>(null);
  const [themePickerMemberId, setThemePickerMemberId] = useState<Id | null>(null);

  const activeMembers = members.filter((member) => member.deletedAt === null);
  const currentMember = activeMembers[0];
  const selectedDashboardMember =
    activeMembers.find((member) => member.id === selectedDashboardMemberId) ??
    currentMember;
  const selectedAdultDashboardMember = selectedDashboardMember.isChild
    ? currentMember
    : selectedDashboardMember;
  const selectedChild = selectedDashboardMember.isChild
    ? selectedDashboardMember
    : activeMembers.find((member) => member.isChild);
  const activeReward = rewards[0];
  const rewardProgress = selectedChild
    ? getRewardPathProgress(selectedChild, activeReward, todos)
    : null;
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

  function handleDashboardPointerDown(memberId: Id) {
    const timeoutId = window.setTimeout(() => {
      setThemePickerMemberId(memberId);
    }, 650);

    return () => window.clearTimeout(timeoutId);
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
        <article
          className={`adult-dashboard theme-${
            selectedAdultDashboardMember.dashboardTheme ?? "clear"
          }`}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button, input, select")) {
              return;
            }

            const cancel = handleDashboardPointerDown(selectedAdultDashboardMember.id);
            event.currentTarget.onpointerup = cancel;
            event.currentTarget.onpointerleave = cancel;
          }}
        >
          <header className="section-header">
            <div>
              <p className="eyebrow">Vuxen-dashboard</p>
              <h2>{selectedAdultDashboardMember.name}</h2>
            </div>
          </header>

          <nav className="tab-row" aria-label="Vuxen-dashboard vyer">
            <button
              className={`tab ${adultTab === "calendar" ? "active" : ""}`}
              onClick={() => setAdultTab("calendar")}
              type="button"
            >
              <CalendarDays size={16} />
              Kalender
            </button>
            <button
              className={`tab ${adultTab === "todo" ? "active" : ""}`}
              onClick={() => setAdultTab("todo")}
              type="button"
            >
              <ListTodo size={16} />
              Todo
            </button>
            <button
              className={`tab ${adultTab === "shopping" ? "active" : ""}`}
              onClick={() => setAdultTab("shopping")}
              type="button"
            >
              <ShoppingCart size={16} />
              Inköp
            </button>
          </nav>

          {adultTab === "calendar" ? (
            <CalendarPanel
              calendars={calendars}
              currentMember={selectedAdultDashboardMember}
              members={activeMembers}
              roles={roles}
              onAddEvent={(calendarId, event) =>
                addCalendarEvent(calendarId, event, selectedAdultDashboardMember.id)
              }
              onCreateCalendar={(name) =>
                createCalendar(name, selectedAdultDashboardMember.id)
              }
              onImportCalendar={(calendarId, sourceName, events) =>
                importCalendarEvents(calendarId, sourceName, events, selectedAdultDashboardMember.id)
              }
              onRemoveCalendarShare={removeCalendarShare}
              onShareCalendar={shareCalendar}
            />
          ) : null}

          {adultTab === "todo" ? (
            <div className="dashboard-list">
              <TodoCreator
                currentMember={selectedAdultDashboardMember}
                members={activeMembers}
                roles={roles}
                onCreateTodo={createTodo}
              />

              {adultTodos.map((todo) => {
                const isEditing = editingTodoId === todo.id;

                return (
                  <div className="dashboard-row todo-dashboard-row" key={todo.id}>
                    <CheckCircle2 size={18} />

                    {isEditing ? (
                      <input
                        className="text-input todo-title-input"
                        onChange={(event) => setEditingTodoTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            saveTodoTitle(todo.id, selectedAdultDashboardMember, roles);
                          }

                          if (event.key === "Escape") {
                            cancelEditingTodo();
                          }
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
                            onClick={() =>
                              saveTodoTitle(todo.id, selectedAdultDashboardMember, roles)
                            }
                            title="Spara todo"
                            type="button"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            className="icon-button"
                            onClick={cancelEditingTodo}
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
                            onClick={() =>
                              startEditingTodo(todo, selectedAdultDashboardMember, roles)
                            }
                            title="Redigera todo"
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button danger"
                            onClick={() =>
                              softDeleteTodo(todo.id, selectedAdultDashboardMember, roles)
                            }
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
                          disabled={!canCurrentMemberApprove}
                          onClick={() => approveTodo(todo.id, currentMember.id)}
                          title="Godkänn"
                          type="button"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          disabled={!canCurrentMemberApprove}
                          onClick={() => rejectTodo(todo.id, currentMember.id)}
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

          {adultTab === "shopping" ? (
            <ShoppingListsPanel
              currentMember={selectedAdultDashboardMember}
              members={activeMembers}
              roles={roles}
              shoppingLists={shoppingLists}
              onAddItem={(listId, title) =>
                addShoppingItem(listId, title, selectedAdultDashboardMember.id)
              }
              onCreateList={(name) =>
                createShoppingList(name, selectedAdultDashboardMember.id)
              }
              onDeleteList={(listId) =>
                softDeleteShoppingList(listId, selectedAdultDashboardMember.id)
              }
              onRemoveListShare={removeShoppingListShare}
              onShareList={shareShoppingList}
              onToggleItem={toggleShoppingItem}
            />
          ) : null}
        </article>

        {activeAccount.type === "family" && selectedChild && rewardProgress ? (
          <article
            className={`child-dashboard theme-${selectedChild.dashboardTheme ?? "space"}`}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button, input, select")) {
                return;
              }

              const cancel = handleDashboardPointerDown(selectedChild.id);
              event.currentTarget.onpointerup = cancel;
              event.currentTarget.onpointerleave = cancel;
            }}
          >
            <header className="section-header">
              <div>
                <p className="eyebrow">Barn-dashboard</p>
                <h2>{selectedChild.name}</h2>
              </div>
              <Sparkles size={24} />
            </header>

            <div className="reward-card">
              <span className="reward-label">{activeReward.title}</span>
              <strong>{rewardProgress.starsLeft} stjärnor kvar</strong>
            </div>

            <section className="falling-todos" aria-label="Aktiva uppgifter">
              {activeChildTodos.length === 0 ? (
                <p className="empty-note">Inga aktiva uppgifter just nu.</p>
              ) : (
                activeChildTodos.map((todo) => (
                  <button
                    className="falling-todo-card"
                    key={todo.id}
                    onClick={() => completeTodo(selectedChild, todo.id, roles)}
                    type="button"
                  >
                    <span>{todo.visual.value.slice(0, 1)}</span>
                    <strong>{todo.title}</strong>
                    <small>Tryck när du är klar: {todo.starValue} stjärnor</small>
                  </button>
                ))
              )}
            </section>

            <div className="reward-path" aria-label="Belöningsbana">
              {Array.from({ length: 10 }).map((_, index) => {
                const isApproved = index < rewardProgress.approvedStars;
                const pending =
                  rewardProgress.pendingTaskImages[index - rewardProgress.approvedStars];

                return (
                  <span
                    className={`path-step ${isApproved ? "approved" : ""} ${pending ? "pending" : ""}`}
                    key={index}
                  >
                    {isApproved ? (
                      <Star size={18} fill="currentColor" />
                    ) : pending ? (
                      pending.visual.value.slice(0, 1)
                    ) : (
                      ""
                    )}
                  </span>
                );
              })}
            </div>
          </article>
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

      <RoleEditor
        members={members}
        roles={roles}
        onAssignRole={assignRole}
        onCreateRole={createRole}
        onTogglePermission={toggleRolePermission}
      />

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

function getTodoSummary(todo: { status: string; starValue: number }) {
  if (todo.status === "expired") {
    return "Utgången";
  }

  if (todo.status === "done") {
    return "Väntar";
  }

  return `${todo.starValue} stjärnor`;
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
