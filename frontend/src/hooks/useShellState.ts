import { accountsApi } from "../api";
import { useAppState } from "./useAppState";
import { useShellPermissions } from "./useShellPermissions";
import { useRewardShopState } from "../features/rewards/useRewardShopState";
import { useTimedTasksState } from "../features/timedTasks/useTimedTasksState";
import { useTodoCategoriesState } from "../features/todos/useTodoCategoriesState";
import { useTodoTemplatesState } from "../features/todos/useTodoTemplatesState";
import { useAppFont } from "../components/FontPicker";
import type { CalendarFilterKey, CalendarSettings, CalendarViewMode, DashboardThemeId, Id, Membership, TodoThreadRange, TodoViewMode } from "@shared/types";

export function useShellState(activeMembership: Membership, onLogout: () => Promise<void>) {
  // En enda instans delad mellan flytande temaväljaren (Shell) och Inställningar-panelen
  // (SettingsContent) — annars visar de "aktiv"-markering utifrån varsin egen state och
  // ett typsnittsbyte i den ena syns inte som markerad i den andra förrän omladdning.
  const { fontId, setFontId } = useAppFont();

  const {
    activeAccount, setActiveAccount,
    roles, createRole, toggleRolePermission,
    members, createMember, softDeleteMember, restoreMember,
    updateMemberTheme, updateMemberAvatar, updateMemberColor, assignRole, clearMemberAvatar,
    updateCalendarFilterSettings, updateChildTimelineSettings, updateMemberNavigation,
    todosState, calendarsState, shoppingState, rewardsState,
    currentMember, activeMembers,
    selectedDashboardMemberId, setSelectedDashboardMemberId,
    themePickerMemberId, setThemePickerMemberId,
    activePanel, setActivePanel, apiError
  } = useAppState(activeMembership);

  const { todos, createTodo, completeTodo, softDeleteTodo, restoreTodo, approveTodo, rejectTodo,
    dismissRejectedTodo, softDeleteTodosForMember, updateTodo, toggleSubtask, refreshRoutineOccurrence,
    lastImportResult, setLastImportResult, lastImportUndo, setLastImportUndo } = todosState;

  const { calendars, loadEventsForMonth, createCalendar, updateCalendarColor, renameCalendar, transferCalendar, updateCalendarKeepAllHistory, addCalendarEvent, updateCalendarEvent,
    deleteCalendarEvent, deleteCalendar, rsvpCalendarEvent, importCalendarEvents,
    shareCalendar, removeCalendarShare, restoreCalendar,
    softDeleteCalendarsForMember,
    addSubscription, updateSubscription, removeSubscription, syncSubscription } = calendarsState;

  const { shoppingLists, createShoppingList, addShoppingItem, shareShoppingList,
    removeShoppingListShare, softDeleteShoppingList, restoreShoppingList,
    toggleShoppingItem, softDeleteShoppingForMember } = shoppingState;

  const { rewards, createWish, wishStars, setWishStars,
    approveWish, rejectWish, updateWish } = rewardsState;

  const {
    items: shopItems,
    purchasedItems,
    purchasedTotal,
    purchasedLoading,
    loadMorePurchased,
    purchaseVersion,
    requireApprovalForCategories,
    purchase: purchaseReward,
    movePurchased,
    deletePurchased,
    addItem: addShopItem,
    updateItem: updateShopItem,
    updateSettings: updateShopSettings,
    removeItem: removeShopItem,
  } = useRewardShopState();

  const { timedTasks, createTimedTask, removeTimedTask, recordAttempt, listAttempts, deleteAttempt } =
    useTimedTasksState();

  const {
    categories: personalTodoCategories,
    createCategory: createTodoCategory,
    renameCategory: renameTodoCategory,
    removeCategory: removeTodoCategory,
    setCategoryHidden: setTodoCategoryHidden
  } = useTodoCategoriesState();

  const {
    taskTemplates,
    categoryTemplates,
    createTaskTemplate,
    removeTaskTemplate,
    createCategoryTemplate,
    removeCategoryTemplate
  } = useTodoTemplatesState();

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
    onCreateWish: createWish,
    onCompleteTodo: completeTodo,
    onDismissRejectedTodo: dismissRejectedTodo,
    onThemePickerOpen: setThemePickerMemberId,
    timedTasks,
    onRecordTimedAttempt: recordAttempt,
    onListTimedAttempts: listAttempts,
    onDeleteTimedAttempt: deleteAttempt
  };

  const childContentProps = {
    currentMember,
    calendars,
    todos,
    roles,
    categories: personalTodoCategories,
    ...sharedChildProps
  };

  const memberContentProps = {
    currentMember,
    activeMembers,
    members,
    selectedDashboardMemberId,
    roles,
    todos,
    rewards,
    calendars,
    shoppingLists,
    fixedTodoTimes: activeAccount.fixedTodoTimes ?? false,
    ...permissions,
    wishStars,
    onSelectMember: setSelectedDashboardMemberId,
    onCreateTodo: createTodo,
    onToggleSubtask: toggleSubtask,
    onUpdateTodo: updateTodo,
    onRefreshRoutine: refreshRoutineOccurrence,
    personalCategories: personalTodoCategories,
    onCreateCategory: createTodoCategory,
    onRenameCategory: renameTodoCategory,
    onRemoveCategory: removeTodoCategory,
    onSetCategoryHidden: setTodoCategoryHidden,
    // Mallbibliotek (2026-07-08) — läses in i tråd-vyn/skapa-modalen (Hämta
    // från mall) och skrivs till från tråd-vyns "Spara som mall"-menyval.
    taskTemplates,
    categoryTemplates,
    onCreateTaskTemplate: createTaskTemplate,
    onCreateCategoryTemplate: createCategoryTemplate,
    onSoftDeleteTodo: (todoId: string) => softDeleteTodo(todoId, currentMember, roles),
    // Todos-panelens visningsläge väljs i Inställningar, ingen egen växlare
    // i panelen (2026-07-05, Zaidas beslut) — se settingsProps nedan.
    todoViewMode: currentMember.todoViewMode ?? "thread",
    // Drag-and-drop-ordning på trådarna i "bollar i tråd" (2026-07-06).
    todoThreadOrder: currentMember.todoThreadOrder ?? [],
    onReorderThreads: (order: Id[]) => updateMemberNavigation(currentMember.id, { todoThreadOrder: order }),
    // Hur mycket som visas i tråd-vyn (2026-07-06, Zaidas önskemål) — väljs i
    // Inställningar, se settingsProps nedan.
    todoThreadRange: currentMember.todoThreadRange ?? "today",
    onApproveTodo: (todoId: string) => approveTodo(todoId, currentMember.id),
    onRejectTodo: (todoId: string, reason: string | null) => rejectTodo(todoId, currentMember.id, reason),
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
    fontId,
    setFontId,
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
    // Till skillnad från onUpdateCalendarSettings ovan (som bara sätter
    // lokal state — en redan existerande lucka, calendarSettings-ändringar
    // går aldrig till servern och försvinner vid omladdning) sparar denna
    // faktiskt till kontot, eftersom fixedTodoTimes annars skulle falla
    // tillbaka till av vid nästa inloggning.
    onUpdateFixedTodoTimes: (fixedTodoTimes: boolean) => {
      setActiveAccount({ ...activeAccount, fixedTodoTimes });
      accountsApi.update(activeAccount.id, { fixedTodoTimes }).catch(console.error);
    },
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
    todoViewMode: currentMember.todoViewMode ?? "thread",
    onUpdateTodoViewMode: (mode: TodoViewMode) =>
      updateMemberNavigation(currentMember.id, { todoViewMode: mode }),
    todoThreadRange: currentMember.todoThreadRange ?? "today",
    onUpdateTodoThreadRange: (range: TodoThreadRange) =>
      updateMemberNavigation(currentMember.id, { todoThreadRange: range }),
    onUpdateChildTimelineSettings: updateChildTimelineSettings,
    onAssignRole: assignRole,
    onCreateRole: createRole,
    onTogglePermission: toggleRolePermission,
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
    todoImportResult: lastImportResult,
    onSetTodoImportResult: setLastImportResult,
    todoImportUndo: lastImportUndo,
    onSetTodoImportUndo: setLastImportUndo,
    personalCategories: personalTodoCategories,
    onCreateCategory: createTodoCategory,
    onSetCategoryHidden: setTodoCategoryHidden,
    taskTemplates,
    categoryTemplates,
    onCreateTaskTemplate: createTaskTemplate,
    onCreateCategoryTemplate: createCategoryTemplate,
    onRemoveTaskTemplate: removeTaskTemplate,
    onRemoveCategoryTemplate: removeCategoryTemplate,
    onApproveTodo: (todoId: string) => approveTodo(todoId, currentMember.id),
    onRejectTodo: (todoId: string, reason: string | null) => rejectTodo(todoId, currentMember.id, reason),
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
          requiredCategories: [],
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
    purchasedItems,
    purchasedTotal,
    purchasedLoading,
    loadMorePurchased,
    onAddShopItem: (item: Parameters<typeof addShopItem>[0]) => void addShopItem(item),
    onUpdateShopItem: (id: string, patch: Parameters<typeof updateShopItem>[1]) => void updateShopItem(id, patch),
    onRemoveShopItem: (id: string) => void removeShopItem(id),
    onMovePurchased: (id: string, startsAt: string) => void movePurchased(id, startsAt),
    onDeletePurchased: (id: string) => void deletePurchased(id),
    timedTasks,
    onCreateTimedTask: (title: string, symbol: string | null, assignedTo: string) =>
      void createTimedTask(title, symbol, assignedTo),
    onRemoveTimedTask: (id: string) => void removeTimedTask(id),
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
    settingsProps,
    fontId,
    setFontId,
    shopSettings: {
      requireApprovalForCategories,
      updateSettings: updateShopSettings,
      items: shopItems,
      purchaseVersion,
      onPurchaseReward: purchaseReward,
    },
  };
}
