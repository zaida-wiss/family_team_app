import { accountsApi } from "../api";
import { useAppState } from "./useAppState";
import { useShellPermissions } from "./useShellPermissions";
import type { DashboardThemeId, Id, Membership } from "@shared/types";

export function useShellState(activeMembership: Membership, onLogout: () => Promise<void>) {
  const {
    activeAccount, setActiveAccount,
    roles, createRole, toggleRolePermission,
    members, createMember, softDeleteMember, restoreMember,
    updateMemberTheme, updateMemberAvatar, updateMemberColor, assignRole, clearMemberAvatar,
    todosState, calendarsState, shoppingState, rewardsState,
    currentMember, activeMembers,
    selectedDashboardMemberId, setSelectedDashboardMemberId,
    themePickerMemberId, setThemePickerMemberId,
    activePanel, setActivePanel, apiError
  } = useAppState(activeMembership);

  const { todos, editingTodoId, editingTodoTitle, setEditingTodoTitle,
    createTodo, completeTodo, startEditingTodo, saveTodoTitle,
    cancelEditingTodo, softDeleteTodo, restoreTodo, approveTodo, rejectTodo,
    dismissRejectedTodo, softDeleteTodosForMember } = todosState;

  const { calendars, createCalendar, addCalendarEvent, updateCalendarEvent,
    deleteCalendarEvent, deleteCalendar, rsvpCalendarEvent, importCalendarEvents,
    shareCalendar, removeCalendarShare, restoreCalendar,
    softDeleteCalendarsForMember,
    addSubscription, updateSubscription, removeSubscription, syncSubscription } = calendarsState;

  const { shoppingLists, createShoppingList, addShoppingItem, shareShoppingList,
    removeShoppingListShare, softDeleteShoppingList, restoreShoppingList,
    toggleShoppingItem, softDeleteShoppingForMember } = shoppingState;

  const { rewards, wishTitle, setWishTitle, createWish, wishStars, setWishStars,
    approveWish, rejectWish } = rewardsState;

  const permissions = useShellPermissions(currentMember, roles);

  const themePickerMember = themePickerMemberId
    ? activeMembers.find((m) => m.id === themePickerMemberId) ?? null
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

  const sharedChildProps = {
    wishTitle,
    onSetWishTitle: setWishTitle,
    onCreateWish: createWish,
    onCompleteTodo: completeTodo,
    onDismissRejectedTodo: dismissRejectedTodo,
    onThemePickerOpen: setThemePickerMemberId
  };

  const childContentProps = {
    currentMember,
    todos,
    rewards,
    roles,
    ...sharedChildProps
  };

  const memberContentProps = {
    currentMember,
    activeMembers,
    selectedDashboardMemberId,
    roles,
    todos,
    rewards,
    calendars,
    shoppingLists,
    ...permissions,
    editingTodoId,
    editingTodoTitle,
    wishStars,
    onSelectMember: setSelectedDashboardMemberId,
    onSetEditingTodoTitle: setEditingTodoTitle,
    onStartEditingTodo: (todo: Parameters<typeof startEditingTodo>[0]) =>
      startEditingTodo(todo, currentMember, roles),
    onSaveTodoTitle: (todoId: string) => saveTodoTitle(todoId, currentMember, roles),
    onCancelEditingTodo: cancelEditingTodo,
    onCreateTodo: createTodo,
    onSoftDeleteTodo: (todoId: string) => softDeleteTodo(todoId, currentMember, roles),
    onApproveTodo: (todoId: string) => approveTodo(todoId, currentMember.id),
    onRejectTodo: (todoId: string) => rejectTodo(todoId, currentMember.id),
    onApproveWish: (rewardId: string) => approveWish(rewardId, currentMember.id),
    onRejectWish: (rewardId: string) => rejectWish(rewardId, currentMember.id),
    onSetWishStars: (rewardId: string, stars: number) =>
      setWishStars((prev) => ({ ...prev, [rewardId]: stars })),
    onAddCalendarEvent: (calendarId: string, event: Parameters<typeof addCalendarEvent>[1]) =>
      addCalendarEvent(calendarId, event, currentMember.id),
    onUpdateCalendarEvent: (calendarId: string, eventId: string, updates: Parameters<typeof updateCalendarEvent>[2]) =>
      updateCalendarEvent(calendarId, eventId, updates),
    onDeleteCalendarEvent: (calendarId: string, eventId: string) =>
      deleteCalendarEvent(calendarId, eventId, currentMember.id),
    onRsvpCalendarEvent: (calendarId: string, eventId: string, status: "accepted" | "declined") =>
      rsvpCalendarEvent(calendarId, eventId, currentMember.id, status),
    onCreateCalendar: (name: string) => createCalendar(name, currentMember.id),
    onDeleteCalendar: (calendarId: string) => deleteCalendar(calendarId, currentMember.id),
    onAddSubscription: addSubscription,
    onUpdateSubscription: updateSubscription,
    onRemoveSubscription: removeSubscription,
    onSyncSubscription: syncSubscription,
    onImportCalendar: (
      calendarId: string,
      sourceName: string,
      events: Parameters<typeof importCalendarEvents>[2]
    ) => importCalendarEvents(calendarId, sourceName, events, currentMember.id),
    onShareCalendar: shareCalendar,
    onRemoveCalendarShare: removeCalendarShare,
    onAddShoppingItem: (listId: string, title: string) =>
      addShoppingItem(listId, title, currentMember.id),
    onCreateShoppingList: (name: string) => createShoppingList(name, currentMember.id),
    onDeleteShoppingList: (listId: string) => softDeleteShoppingList(listId, currentMember.id),
    onShareShoppingList: shareShoppingList,
    onRemoveShoppingListShare: removeShoppingListShare,
    onToggleShoppingItem: toggleShoppingItem,
    ...sharedChildProps
  };

  async function deleteAccount() {
    await accountsApi.delete(activeAccount.id);
    await onLogout();
  }

  const settingsProps = {
    account: activeAccount,
    currentMember,
    members,
    roles,
    todos,
    calendars,
    shoppingLists,
    canManageMembers: permissions.canManageMembers,
    canManageRoles: permissions.canManageRoles,
    canViewTrash: permissions.canViewTrash,
    onUpdateAccount: setActiveAccount,
    onCreateMember: createMember,
    onDeleteMember: (id: string) => softDeleteMember(id, currentMember.id),
    onDeleteOwnData: deleteOwnData,
    onUpdateMemberAvatar: updateMemberAvatar,
    onUpdateMemberColor: updateMemberColor,
    onAssignRole: assignRole,
    onCreateRole: createRole,
    onTogglePermission: toggleRolePermission,
    onRestoreCalendar: restoreCalendar,
    onRestoreMember: restoreMember,
    onRestoreShoppingList: restoreShoppingList,
    onRestoreTodo: restoreTodo,
    onDeleteAccount: deleteAccount
  };

  return {
    activeAccount,
    currentMember,
    activePanel,
    setActivePanel,
    themePickerMember,
    handleThemeSelect,
    closeThemePicker: () => setThemePickerMemberId(null),
    apiError,
    childContentProps,
    memberContentProps,
    settingsProps
  };
}
