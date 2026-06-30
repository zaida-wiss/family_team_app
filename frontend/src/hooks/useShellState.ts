import { accountsApi } from "../api";
import { useAppState } from "./useAppState";
import { useShellPermissions } from "./useShellPermissions";
import { useRewardShopState } from "../features/rewards/useRewardShopState";
import type { CalendarFilterKey, CalendarSettings, CalendarViewMode, DashboardThemeId, Id, Membership } from "@shared/types";

export function useShellState(activeMembership: Membership, onLogout: () => Promise<void>) {
  const {
    activeAccount, setActiveAccount,
    roles, createRole, toggleRolePermission,
    members, createMember, softDeleteMember, restoreMember,
    updateMemberTheme, updateMemberAvatar, updateMemberColor, assignRole, clearMemberAvatar, refundPurchase,
    updateCalendarFilterSettings, updateChildTimelineSettings, updateMemberNavigation,
    todosState, calendarsState, shoppingState, rewardsState,
    currentMember, activeMembers,
    selectedDashboardMemberId, setSelectedDashboardMemberId,
    themePickerMemberId, setThemePickerMemberId,
    activePanel, setActivePanel, apiError
  } = useAppState(activeMembership);

  const { todos, editingTodoId, editingTodoTitle, setEditingTodoTitle,
    createTodo, completeTodo, startEditingTodo, saveTodoTitle,
    cancelEditingTodo, softDeleteTodo, restoreTodo, approveTodo, rejectTodo,
    dismissRejectedTodo, softDeleteTodosForMember, updateTodo, refreshRoutineOccurrence } = todosState;

  const { calendars, loadEventsForMonth, createCalendar, updateCalendarColor, renameCalendar, transferCalendar, updateCalendarKeepAllHistory, addCalendarEvent, updateCalendarEvent,
    deleteCalendarEvent, deleteCalendar, rsvpCalendarEvent, importCalendarEvents,
    shareCalendar, removeCalendarShare, restoreCalendar,
    softDeleteCalendarsForMember,
    addSubscription, updateSubscription, removeSubscription, syncSubscription } = calendarsState;

  const { shoppingLists, createShoppingList, addShoppingItem, shareShoppingList,
    removeShoppingListShare, softDeleteShoppingList, restoreShoppingList,
    toggleShoppingItem, softDeleteShoppingForMember } = shoppingState;

  const { rewards, wishTitle, setWishTitle, createWish, wishStars, setWishStars,
    approveWish, rejectWish, updateWish } = rewardsState;

  const {
    items: shopItems,
    purchased,
    purchase: purchaseReward,
    movePurchased,
    deletePurchased,
    addItem: addShopItem,
    updateItem: updateShopItem,
    removeItem: removeShopItem,
  } = useRewardShopState();

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
    calendars,
    todos,
    rewards,
    roles,
    shopItems,
    purchased,
    onPurchaseReward: purchaseReward,
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
    onCreateCalendar: (name: string, color: string) => createCalendar(name, currentMember.id, color),
    onUpdateCalendarColor: updateCalendarColor,
    onUpdateCalendarFilterSettings: (filterKey: CalendarFilterKey, visibleCalendarIds: Id[]) =>
      updateCalendarFilterSettings(currentMember.id, filterKey, visibleCalendarIds),
    onUpdateCalendarView: (view: CalendarViewMode) =>
      updateMemberNavigation(currentMember.id, { calendarView: view }),
    onRenameCalendar: renameCalendar,
    onTransferCalendar: transferCalendar,
    onDeleteCalendar: (calendarId: string) => deleteCalendar(calendarId, currentMember.id),
    onLoadEventsForMonth: loadEventsForMonth,
    onUpdateCalendarKeepAllHistory: updateCalendarKeepAllHistory,
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
    shopItems,
    purchased,
    onPurchaseReward: purchaseReward,
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
    rewards,
    calendars,
    shoppingLists,
    wishStars,
    canManageMembers: permissions.canManageMembers,
    canManageRoles: permissions.canManageRoles,
    canViewTrash: permissions.canViewTrash,
    onUpdateAccount: setActiveAccount,
    onUpdateCalendarSettings: (settings: CalendarSettings) =>
      setActiveAccount({ ...activeAccount, calendarSettings: settings }),
    onCreateMember: createMember,
    onDeleteMember: (id: string) => softDeleteMember(id, currentMember.id),
    onDeleteOwnData: deleteOwnData,
    onUpdateMemberAvatar: updateMemberAvatar,
    onUpdateMemberColor: updateMemberColor,
    onUpdateMemberTheme: updateMemberTheme,
    onUpdateCalendarFilterSettings: (filterKey: CalendarFilterKey, visibleCalendarIds: Id[]) =>
      updateCalendarFilterSettings(currentMember.id, filterKey, visibleCalendarIds),
    onUpdateCalendarView: (view: CalendarViewMode) =>
      updateMemberNavigation(currentMember.id, { calendarView: view }),
    onUpdateChildTimelineSettings: updateChildTimelineSettings,
    onAssignRole: assignRole,
    onCreateRole: createRole,
    onTogglePermission: toggleRolePermission,
    onRefundPurchase: refundPurchase,
    onRestoreCalendar: restoreCalendar,
    onRestoreMember: restoreMember,
    onRestoreShoppingList: restoreShoppingList,
    onRestoreTodo: restoreTodo,
    onDeleteAccount: deleteAccount,
    onCreateWish: createWish,
    onCreateTodo: createTodo,
    onUpdateTodo: updateTodo,
    onRefreshRoutine: refreshRoutineOccurrence,
    onDeleteTodo: (id: string) => softDeleteTodo(id, currentMember, roles),
    onApproveTodo: (todoId: string) => approveTodo(todoId, currentMember.id),
    onRejectTodo: (todoId: string) => rejectTodo(todoId, currentMember.id),
    onApproveWish: (rewardId: string) => {
      const wish = rewards.find((r) => r.id === rewardId);
      if (wish) {
        addShopItem({
          id: `rsi-wish-${Date.now()}`,
          title: wish.title,
          symbol: wish.symbol ?? null,
          starCost: wish.starsNeeded,
          timerMinutes: null,
          availability: null,
          createdBy: currentMember.id,
          deletedAt: null,
        });
      }
      approveWish(rewardId, currentMember.id);
    },
    onRejectWish: (rewardId: string) => rejectWish(rewardId, currentMember.id),
    onUpdateWish: (rewardId: string, patch: { title?: string; starsNeeded?: number; symbol?: string | null }) => updateWish(rewardId, patch),
    onSetWishStars: (rewardId: string, stars: number) =>
      setWishStars((prev) => ({ ...prev, [rewardId]: stars })),
    shopItems,
    purchased,
    onAddShopItem: (item: Parameters<typeof addShopItem>[0]) => void addShopItem(item),
    onUpdateShopItem: (id: string, patch: Parameters<typeof updateShopItem>[1]) => void updateShopItem(id, patch),
    onRemoveShopItem: (id: string) => void removeShopItem(id),
    onMovePurchased: (id: string, startsAt: string) => void movePurchased(id, startsAt),
    onDeletePurchased: (id: string) => void deletePurchased(id),
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
