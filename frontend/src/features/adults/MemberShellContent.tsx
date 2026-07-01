import { lazy, Suspense, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import type { CalendarFilter } from "../calendars/CalendarView";

const ChildDashboard = lazy(() =>
  import("../children/ChildDashboard").then((m) => ({ default: m.ChildDashboard }))
);
import { Dashboard } from "./Dashboard";
import { CalendarPage } from "../../pages/CalendarPage";
import { HomePage } from "../../pages/HomePage";
import { ShoppingView } from "../shopping/ShoppingView";
import { TodosView } from "../todos/TodosView";
import { canViewResource, hasPermission } from "../../utils/permissions";
import type { ShellPanel } from "../../hooks/useAppState";
import type { Calendar, CalendarEvent, CalendarFilterKey, CalendarSettings, CalendarViewMode, Member, Reward, Role, ShoppingList, Todo } from "@shared/types";

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
  onUpdateCalendarEvent: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteCalendarEvent: (calendarId: string, eventId: string) => void;
  onRsvpCalendarEvent: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
  onCreateCalendar: DashboardProps["onCreateCalendar"];
  onUpdateCalendarFilterSettings: (filterKey: CalendarFilterKey, visibleCalendarIds: string[]) => void;
  onUpdateCalendarView: (view: CalendarViewMode) => void;
  onImportCalendar: DashboardProps["onImportCalendar"];
  onShareCalendar: DashboardProps["onShareCalendar"];
  onRemoveCalendarShare: (calendarId: string, memberId: string) => void;
  onAddShoppingItem: (listId: string, title: string) => void;
  onCreateShoppingList: (name: string) => void;
  onDeleteShoppingList: (listId: string) => void;
  onShareShoppingList: DashboardProps["onShareShoppingList"];
  onRemoveShoppingListShare: (listId: string, memberId: string) => void;
  onToggleShoppingItem: (listId: string, itemId: string) => void;
  calendarSettings?: CalendarSettings;
  onThemePickerOpen: (memberId: string) => void;
  onCompleteTodo: (member: Member, todoId: string, roles: Role[]) => void;
  onDismissRejectedTodo: (todoId: string, memberId: string) => void;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: string, starsNeeded?: number, title?: string) => void;
  onLoadEventsForMonth?: (year: number, month: number) => Promise<void>;
  onUpdateCalendarKeepAllHistory?: DashboardProps["onUpdateCalendarKeepAllHistory"];
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
  canSeeCalendar, canSeeTodos, canSeeShopping, canApproveTodos, canManageMembers,
  editingTodoId, editingTodoTitle, wishStars, wishTitle,
  onNavigate, onSelectMember, onSetEditingTodoTitle, onStartEditingTodo, onSaveTodoTitle,
  onCancelEditingTodo, onCreateTodo, onSoftDeleteTodo, onApproveTodo, onRejectTodo,
  onApproveWish, onRejectWish, onSetWishStars, onAddCalendarEvent,
  onUpdateCalendarEvent, onDeleteCalendarEvent, onRsvpCalendarEvent,
  onUpdateCalendarFilterSettings, onUpdateCalendarView,
  onAddShoppingItem, onToggleShoppingItem, onThemePickerOpen, onCompleteTodo,
  onDismissRejectedTodo, onSetWishTitle, onCreateWish, calendarSettings, onLoadEventsForMonth,
}: Props) {
  const [calSearch, setCalSearch] = useState("");
  const [homeSearch, setHomeSearch] = useState("");

  const canSeeAllCalendars = hasPermission(currentMember, roles, "canSeeAllCalendar");
  const canSeeOwnCalendars = hasPermission(currentMember, roles, "canSeeOwnCalendar");

  const accessibleCalendarIds = useMemo(
    () =>
      calendars
        .filter((calendar) => {
          if (calendar.deletedAt !== null) return false;
          if (canSeeAllCalendars) return true;
          return canSeeOwnCalendars && canViewResource(currentMember, calendar);
        })
        .map((calendar) => calendar.id),
    [calendars, canSeeAllCalendars, canSeeOwnCalendars, currentMember]
  );

  const calendarFilter = useMemo<CalendarFilter>(() => {
    const savedVisibleCalendarIds = currentMember.calendarFilterSettings?.calendar?.visibleCalendarIds;
    const hiddenCalendarIds = savedVisibleCalendarIds
      ? new Set(accessibleCalendarIds.filter((id) => !savedVisibleCalendarIds.includes(id)))
      : new Set<string>();

    return {
      searchQuery: calSearch,
      setSearchQuery: setCalSearch,
      hiddenCalendarIds,
      setHiddenCalendarIds: (nextHiddenCalendarIds) => {
        const visibleCalendarIds = accessibleCalendarIds.filter((id) => !nextHiddenCalendarIds.has(id));
        onUpdateCalendarFilterSettings("calendar", visibleCalendarIds);
      }
    };
  }, [accessibleCalendarIds, calSearch, currentMember.calendarFilterSettings, onUpdateCalendarFilterSettings]);

  const homeFilter = useMemo<CalendarFilter>(() => {
    const savedVisibleCalendarIds = currentMember.calendarFilterSettings?.home?.visibleCalendarIds;
    const hiddenCalendarIds = savedVisibleCalendarIds
      ? new Set(accessibleCalendarIds.filter((id) => !savedVisibleCalendarIds.includes(id)))
      : new Set<string>();

    return {
      searchQuery: homeSearch,
      setSearchQuery: setHomeSearch,
      hiddenCalendarIds,
      setHiddenCalendarIds: (nextHiddenCalendarIds) => {
        const visibleCalendarIds = accessibleCalendarIds.filter((id) => !nextHiddenCalendarIds.has(id));
        onUpdateCalendarFilterSettings("home", visibleCalendarIds);
      }
    };
  }, [accessibleCalendarIds, currentMember.calendarFilterSettings, homeSearch, onUpdateCalendarFilterSettings]);

  const selectedDashboardMember = useMemo(
    () => activeMembers.find((m) => m.id === selectedDashboardMemberId) ?? null,
    [activeMembers, selectedDashboardMemberId]
  );

  const selectedMemberRole = useMemo(
    () => selectedDashboardMember ? roles.find((r) => r.id === selectedDashboardMember.roleId) ?? null : null,
    [roles, selectedDashboardMember]
  );

  const children = useMemo(
    () => activeMembers.filter((m) => m.isChild),
    [activeMembers]
  );

  // ── Kalender-vy (nav) ────────────────────────────────────────────────────
  if (activePanel === "calendar") {
    return (
      <CalendarPage
        calendars={canSeeCalendar ? calendars : []}
        currentMember={currentMember}
        activeMembers={activeMembers}
        roles={roles}
        calendarSettings={calendarSettings}
        calendarView={currentMember.calendarView ?? "month"}
        filter={calendarFilter}
        onCalendarViewChange={onUpdateCalendarView}
        onAddEvent={onAddCalendarEvent}
        onUpdateEvent={onUpdateCalendarEvent}
        onDeleteEvent={onDeleteCalendarEvent}
        onRsvpEvent={onRsvpCalendarEvent}
        onMonthChange={onLoadEventsForMonth}
      />
    );
  }

  // ── Inköps-vy (nav) — bocka av, lägg till varor, ingen hantering ─────────
  if (activePanel === "shopping") {
    return (
      <ShoppingView
        currentMember={currentMember}
        roles={roles}
        shoppingLists={canSeeShopping ? shoppingLists : []}
        onAddItem={onAddShoppingItem}
        onToggleItem={onToggleShoppingItem}
      />
    );
  }

  // ── Todos-vy (nav) — skapa/klara/godkänn, ingen delnings-UI ─────────────
  if (activePanel === "todos") {
    return (
      <TodosView
        currentMember={currentMember}
        members={activeMembers}
        roles={roles}
        todos={todos}
        rewards={rewards}
        editingTodoId={editingTodoId}
        editingTodoTitle={editingTodoTitle}
        canApproveTodos={canApproveTodos}
        canSeeTodos={canSeeTodos}
        wishStars={wishStars}
        onSetEditingTodoTitle={onSetEditingTodoTitle}
        onStartEditingTodo={onStartEditingTodo}
        onSaveTodoTitle={onSaveTodoTitle}
        onCancelEditingTodo={onCancelEditingTodo}
        onCreateTodo={onCreateTodo}
        onSoftDeleteTodo={onSoftDeleteTodo}
        onApproveTodo={onApproveTodo}
        onRejectTodo={onRejectTodo}
        onApproveWish={onApproveWish}
        onRejectWish={onRejectWish}
        onSetWishStars={onSetWishStars}
      />
    );
  }

  // ── Hem-panel ─────────────────────────────────────────────────────────────
  const selectedMemberIsChild =
    !!selectedDashboardMember && (selectedDashboardMember.isChild || !!selectedMemberRole?.isChildRole);

  // Valt barn → barnens dashboard (enda vyn som är annorlunda)
  if (selectedMemberIsChild && selectedDashboardMember) {
    const now = Date.now();
    const childRewards = rewards.filter((r) => r.wishedBy === selectedDashboardMember.id);
    const activeChildTodos = todos
      .filter(
        (t) =>
          t.assignedTo === selectedDashboardMember.id &&
          t.status === "pending" &&
          t.recurrence.type === "none" &&
          t.deletedAt === null &&
          isTodoVisibleNow(t, now)
      )
      .sort((a, b) => {
        const aTime = a.visibleFrom ? new Date(a.visibleFrom).getTime() : 0;
        const bTime = b.visibleFrom ? new Date(b.visibleFrom).getTime() : 0;
        return aTime - bTime;
      });
    const rejectedTodos = todos.filter(
      (t) =>
        t.assignedTo === selectedDashboardMember.id &&
        t.status === "rejected" &&
        t.deletedAt === null
    );

    return (
      <Suspense fallback={null}>
        <ChildDashboard
          child={selectedDashboardMember}
          calendars={calendars}
          roles={roles}
          childRewards={childRewards}
          timelineTodos={todos}
          activeChildTodos={activeChildTodos}
          rejectedTodos={rejectedTodos}
          wishTitle={wishTitle}
          onSetWishTitle={onSetWishTitle}
          onCreateWish={onCreateWish}
          onCompleteTodo={(todoId) => onCompleteTodo(selectedDashboardMember, todoId, roles)}
          onDismissRejectedTodo={(todoId) =>
            onDismissRejectedTodo(todoId, selectedDashboardMember.id)
          }
          onThemePickerOpen={onThemePickerOpen}
        />
      </Suspense>
    );
  }

  // Vald vuxen → hemvy för den personen
  if (selectedDashboardMember) {
    return (
      <HomePage
        key={selectedDashboardMember.id}
        currentMember={selectedDashboardMember}
        accountName={accountName}
        roles={roles}
        activeMembers={activeMembers}
        selectedMemberId={selectedDashboardMember.id}
        calendars={canSeeCalendar ? calendars : []}
        canSeeCalendar={canSeeCalendar}
        calendarFilter={homeFilter}
        onSelectMember={onSelectMember}
        onOpenCalendar={() => onNavigate("calendar")}
        calendarSettings={calendarSettings}
        onAddEvent={onAddCalendarEvent}
        onUpdateEvent={onUpdateCalendarEvent}
        onDeleteEvent={onDeleteCalendarEvent}
        onLoadEventsForMonth={onLoadEventsForMonth}
      />
    );
  }

  // Ingen vald → översikten
  return (
    <>
      <HomePage
        currentMember={currentMember}
        accountName={accountName}
        roles={roles}
        activeMembers={activeMembers}
        selectedMemberId=""
        calendars={canSeeCalendar ? calendars : []}
        canSeeCalendar={canSeeCalendar}
        calendarFilter={homeFilter}
        onSelectMember={onSelectMember}
        onOpenCalendar={() => onNavigate("calendar")}
        calendarSettings={calendarSettings}
        onAddEvent={onAddCalendarEvent}
        onUpdateEvent={onUpdateCalendarEvent}
        onDeleteEvent={onDeleteCalendarEvent}
        onLoadEventsForMonth={onLoadEventsForMonth}
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
