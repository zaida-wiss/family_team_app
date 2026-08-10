import { accountsApi } from "../api";
import { useAppState } from "./useAppState";
import { useDeviceSetting } from "./useDeviceSetting";
import { useShellPermissions } from "./useShellPermissions";
import { useRewardShopState } from "../features/rewards/useRewardShopState";
import { useTimedTasksState } from "../features/timedTasks/useTimedTasksState";
import { useTodoCategoriesState } from "../features/todos/useTodoCategoriesState";
import { useTodoTemplatesState } from "../features/todos/useTodoTemplatesState";
import { useRecipesState } from "../features/recipes/useRecipesState";
import { useAppFont } from "../components/FontPicker";
import type { CalendarFilterKey, CalendarSettings, CalendarViewMode, DashboardThemeId, Id, Membership, TextSize, TodoThreadRange, TodoViewMode, User } from "@shared/types";

export function useShellState(
  activeMembership: Membership,
  onLogout: () => Promise<void>,
  memberships: Membership[],
  onSelectMembership: (m: Membership) => void,
  onMembershipsUpdated: (ms: Membership[]) => void,
  user: User,
  onUpdateMyAvatar: (avatarUrl: string | null) => Promise<void>
) {
  // En enda instans delad mellan flytande temaväljaren (Shell) och Inställningar-panelen
  // (SettingsContent) — annars visar de "aktiv"-markering utifrån varsin egen state och
  // ett typsnittsbyte i den ena syns inte som markerad i den andra förrän omladdning.
  const { fontId, setFontId } = useAppFont();

  const {
    activeAccount, setActiveAccount,
    roles, createRole, toggleRolePermission,
    members, createMember, softDeleteMember, restoreMember, purgeMembersTrash,
    updateMemberTheme, updateMemberDarkMode, updateMemberTextSize, updateMemberHiddenCrossAccountIds, updateMemberAvatar, updateMemberColor, updateMemberName, assignRole, clearMemberAvatar,
    setChildCredentials,
    updateCalendarFilterSettings, updateChildTimelineSettings, updateMemberNavigation,
    todosState, calendarsState, shoppingState, rewardsState,
    currentMember, activeMembers,
    selectedDashboardMemberId, setSelectedDashboardMemberId,
    themePickerMemberId, setThemePickerMemberId,
    activePanel, setActivePanel, panelNavResetKey, apiError
  } = useAppState(activeMembership);

  const { todos, createTodo, completeTodo, uncompleteTodo, softDeleteTodo, restoreTodo, purgeTodosTrash, purgeTodo, approveTodo, rejectTodo,
    dismissRejectedTodo, softDeleteTodosForMember, updateTodo, toggleSubtask, toggleTodoInProgress, refreshRoutineOccurrence,
    lastImportResult, setLastImportResult, lastImportUndo, setLastImportUndo,
    recordCelebration, setRecordCelebration } = todosState;

  const { calendars, loadEventsForMonth, createCalendar, updateCalendarColor, renameCalendar, transferCalendar, updateCalendarKeepAllHistory, updateCalendarShareAcrossMyAccounts, addCalendarEvent, updateCalendarEvent,
    deleteCalendarEvent, deleteCalendar, rsvpCalendarEvent, importCalendarEvents,
    shareCalendar, removeCalendarShare, restoreCalendar, purgeCalendarsTrash,
    softDeleteCalendarsForMember,
    addSubscription, updateSubscription, removeSubscription, syncSubscription,
    appleAccounts, refreshAppleAccounts, addAppleAccount, removeAppleAccount, listCalendarsForAppleAccount,
    connectAppleCalDav, disconnectCalDav, updateCalDavInterval, syncCalDavNow } = calendarsState;

  const { shoppingLists, createShoppingList, addShoppingItem, importShoppingItems, shareShoppingList,
    removeShoppingListShare, softDeleteShoppingList, renameShoppingList, restoreShoppingList, purgeShoppingTrash,
    toggleShoppingItem, deleteShoppingItem, reorderShoppingItems, clearCompletedShoppingItems,
    softDeleteShoppingForMember } = shoppingState;

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
    updateTaskTemplate,
    createCategoryTemplate,
    updateCategoryTemplate,
    removeCategoryTemplate
  } = useTodoTemplatesState();

  // Delad instans (2026-07-26) — behövs av BÅDE Recept-panelen
  // (memberContentProps) och Inställningars nya import/export-kategori
  // (settingsProps, "istället för i receptvyn", Zaidas rättelse), samma
  // "en instans i useShellState.ts"-mönster som övriga funktioner ovan.
  const { recipes, createRecipe, updateRecipe, removeRecipe, importRecipes } = useRecipesState();

  const permissions = useShellPermissions(currentMember, roles);

  // Enhetsspecifika inställningar (2026-08-10, Zaidas önskemål) — sparas
  // BARA i localStorage på den här enheten, aldrig synkade till kontot. Se
  // useDeviceSetting.ts. Textstorlek behåller ett explicit på/av-läge (Zaidas
  // val: "kontot har ett standardval, men varje enhet kan avvika lokalt om
  // man vill") — så länge ingen override är satt beter sig knapparna precis
  // som innan (skriver till kontot, synkas mellan enheter). Avstånd/
  // bubbelstorlek är rena layoutpreferenser för just DEN HÄR skärmen och
  // blir därför alltid enhetslokala så fort man drar i reglaget, utan någon
  // egen på/av-växel — kontots tidigare värde (om något redan sparats) är
  // bara startpunkten för en enhet som aldrig rört reglaget.
  const textSizeDevice = useDeviceSetting<TextSize>("textSize", currentMember.textSize ?? "normal");
  const todoThreadGapDevice = useDeviceSetting<number | undefined>("todoThreadGap", currentMember.todoThreadGap);
  const todoBubbleSizeDevice = useDeviceSetting<number | undefined>("todoBubbleSize", currentMember.todoBubbleSize);
  const textSizeDeviceOverride = textSizeDevice.hasOverride ? textSizeDevice.value : null;

  function handleToggleDeviceTextSize(enabled: boolean) {
    if (enabled) {
      textSizeDevice.setOverride(textSizeDevice.value);
    } else {
      textSizeDevice.clearOverride();
    }
  }

  async function createFamily(name: string) {
    const { membership } = await accountsApi.setup(name);
    onMembershipsUpdated([...memberships, membership]);
    onSelectMembership(membership);
  }

  const themePickerMember = themePickerMemberId
    ? activeMembers.find((m) => m.id === themePickerMemberId) ?? null
    : null;

  function handleThemeSelect(memberId: Id, themeId: DashboardThemeId) {
    updateMemberTheme(memberId, themeId);
    setThemePickerMemberId(null);
  }

  // Mörkt läge (2026-07-23) — till skillnad från handleThemeSelect stängs
  // INTE popovern, en av/på-växel är inget slutgiltigt val på samma sätt.
  function handleDarkModeToggle(memberId: Id, darkMode: boolean) {
    updateMemberDarkMode(memberId, darkMode);
  }

  // Textstorlek (2026-07-25, utökad 2026-08-10 med enhetsspecifik override)
  // — samma "stäng inte popovern"-resonemang som handleDarkModeToggle. Är
  // den här enheten satt till en egen textstorlek skrivs valet ENBART dit
  // (localStorage) — annars precis som innan, till kontot (synkas mellan
  // enheter).
  function handleTextSizeSelect(memberId: Id, textSize: TextSize) {
    if (textSizeDevice.hasOverride) {
      textSizeDevice.setOverride(textSize);
    } else {
      updateMemberTextSize(memberId, textSize);
    }
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
    onUncompleteTodo: uncompleteTodo,
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
    recipes,
    onCreateRecipe: createRecipe,
    onUpdateRecipe: updateRecipe,
    onRemoveRecipe: removeRecipe,
    fixedTodoTimes: activeAccount.fixedTodoTimes ?? false,
    fixedCalendarTimes: activeAccount.fixedCalendarTimes ?? false,
    defaultRecipeShoppingListId: activeAccount.defaultRecipeShoppingListId ?? null,
    ...permissions,
    wishStars,
    onSelectMember: setSelectedDashboardMemberId,
    onCreateTodo: createTodo,
    onToggleSubtask: toggleSubtask,
    onToggleTodoInProgress: toggleTodoInProgress,
    onUpdateTodo: updateTodo,
    onRefreshRoutine: refreshRoutineOccurrence,
    personalCategories: personalTodoCategories,
    onCreateCategory: createTodoCategory,
    onRenameCategory: renameTodoCategory,
    onRemoveCategory: removeTodoCategory,
    onSetCategoryHidden: setTodoCategoryHidden,
    // Massimport/export av familjens uppgifter i Hem-vyn (2026-08-03, Zaidas
    // önskemål) — samma undo/resultat-state som Inställningars personliga
    // import/export (useTodosState.ts), delad så "Ångra senaste import"
    // fungerar oavsett vilken av de två man senast använde.
    todoImportResult: lastImportResult,
    onSetTodoImportResult: setLastImportResult,
    todoImportUndo: lastImportUndo,
    onSetTodoImportUndo: setLastImportUndo,
    // Mallbibliotek (2026-07-08) — läses in i tråd-vyn/skapa-modalen (Hämta
    // från mall) och skrivs till från tråd-vyns "Spara som mall"-menyval.
    taskTemplates,
    categoryTemplates,
    onCreateTaskTemplate: createTaskTemplate,
    onCreateCategoryTemplate: createCategoryTemplate,
    onUpdateCategoryTemplate: updateCategoryTemplate,
    onSoftDeleteTodo: (todoId: string) => softDeleteTodo(todoId, currentMember, roles),
    // Todos-panelens visningsläge väljs i Inställningar, ingen egen växlare
    // i panelen (2026-07-05, Zaidas beslut) — se settingsProps nedan.
    todoViewMode: currentMember.todoViewMode ?? "thread",
    // Drag-and-drop-ordning på trådarna i "bollar i tråd" (2026-07-06).
    todoThreadOrder: currentMember.todoThreadOrder ?? [],
    onReorderThreads: (order: Id[]) => updateMemberNavigation(currentMember.id, { todoThreadOrder: order }),
    todoBubbleOrder: currentMember.todoBubbleOrder ?? {},
    onReorderBubbles: (threadId: Id, order: Id[]) =>
      updateMemberNavigation(currentMember.id, {
        todoBubbleOrder: { ...(currentMember.todoBubbleOrder ?? {}), [threadId]: order }
      }),
    // Drag-and-drop-ordning på Hem-vyns familjetrådar (2026-08-05, Zaidas
    // önskemål: "familjens todovy kan flytta uppgifter och kolumner med tre
    // tryck") — samma mönster som todoThreadOrder ovan, egen fält eftersom
    // familjetrådarnas id:n (kategori-id/"__familyHome__"/"crossAccount:…")
    // är en helt annan mängd än den personliga tråd-vyns.
    familyThreadOrder: currentMember.familyThreadOrder ?? [],
    onReorderFamilyThreads: (order: Id[]) =>
      updateMemberNavigation(currentMember.id, { familyThreadOrder: order }),
    // Hur mycket som visas i tråd-vyn (2026-07-06, Zaidas önskemål) — väljs i
    // Inställningar, se settingsProps nedan.
    todoThreadRange: currentMember.todoThreadRange ?? "today",
    // Vågrätt avstånd mellan kategoritrådarna (2026-07-26, Zaidas önskemål,
    // enhetsspecifik sedan 2026-08-10) — väljs i Inställningar, se
    // settingsProps nedan. undefined = ingen anpassning, ParentTodoThreadView
    // .css:s befintliga clamp() gäller.
    todoThreadGap: todoThreadGapDevice.value,
    // Bubblornas storlek (2026-07-27, Zaidas önskemål) — samma mönster som
    // todoThreadGap ovan.
    todoBubbleSize: todoBubbleSizeDevice.value,
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
    onUpdateCalendarShareAcrossMyAccounts: updateCalendarShareAcrossMyAccounts,
    onAddSubscription: addSubscription,
    onUpdateSubscription: updateSubscription,
    onRemoveSubscription: removeSubscription,
    onSyncSubscription: syncSubscription,
    appleAccounts,
    onRefreshAppleAccounts: refreshAppleAccounts,
    onAddAppleAccount: addAppleAccount,
    onRemoveAppleAccount: removeAppleAccount,
    onListCalendarsForAppleAccount: listCalendarsForAppleAccount,
    onConnectAppleCalDav: connectAppleCalDav,
    onDisconnectCalDav: disconnectCalDav,
    onUpdateCalDavInterval: updateCalDavInterval,
    onSyncCalDavNow: syncCalDavNow,
    onImportCalendar: (
      calendarId: string,
      sourceName: string,
      events: Parameters<typeof importCalendarEvents>[2]
    ) => importCalendarEvents(calendarId, sourceName, events, currentMember.id),
    onShareCalendar: shareCalendar,
    onRemoveCalendarShare: removeCalendarShare,
    onAddShoppingItem: (listId: string, title: string) =>
      addShoppingItem(listId, title, currentMember.id),
    onCreateShoppingList: (name: string, icon?: string | null) =>
      createShoppingList(name, currentMember.id, icon ?? null),
    onDeleteShoppingList: (listId: string) => softDeleteShoppingList(listId, currentMember.id),
    onRenameShoppingList: renameShoppingList,
    onImportShoppingItems: importShoppingItems,
    onShareShoppingList: shareShoppingList,
    onRemoveShoppingListShare: removeShoppingListShare,
    onToggleShoppingItem: toggleShoppingItem,
    onDeleteShoppingItem: (listId: string, itemId: string) =>
      deleteShoppingItem(listId, itemId, currentMember.id),
    onReorderShoppingItems: reorderShoppingItems,
    onClearCompletedShoppingItems: (listId: string) =>
      clearCompletedShoppingItems(listId, currentMember.id),
    // Standardläge för "Visa avklarade" (2026-07-27, Zaidas önskemål) — väljs
    // i Inställningar, se settingsProps nedan.
    shoppingShowCompletedDefault: currentMember.shoppingShowCompletedDefault,
    // Hem-vyns familjefilter (2026-07-31, Zaidas önskemål: "jag vill att den
    // sparar det jag senast valde") — samma updateMemberNavigation-mönster
    // som todoThreadGap/todoBubbleSize ovan.
    homeSelectedFamilyId: currentMember.homeSelectedFamilyId ?? null,
    onUpdateHomeSelectedFamilyId: (id: Id | null) =>
      updateMemberNavigation(currentMember.id, { homeSelectedFamilyId: id }),
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
    recipes,
    onImportRecipes: importRecipes,
    wishStars,
    canManageMembers: permissions.canManageMembers,
    canSeeMembers: permissions.canSeeMembers,
    canManageRoles: permissions.canManageRoles,
    canViewTrash: permissions.canViewTrash,
    onUpdateAccount: setActiveAccount,
    onCreateFamily: createFamily,
    // 2026-08-10: kontonivå-avatar (cascadar till familjer där medlemmen
    // saknar en egen avatarUrl, se membersService.ts:s resolveAvatars).
    myAvatarUrl: user.avatarUrl ?? null,
    onUpdateMyAvatar,
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
    // Samma mönster som ovan, men en HELT EGEN inställning för
    // kalenderhändelser (2026-07-30) — se AccountSettings.tsx.
    onUpdateFixedCalendarTimes: (fixedCalendarTimes: boolean) => {
      setActiveAccount({ ...activeAccount, fixedCalendarTimes });
      accountsApi.update(activeAccount.id, { fixedCalendarTimes }).catch(console.error);
    },
    onUpdateDefaultRecipeShoppingList: (defaultRecipeShoppingListId: Id | null) => {
      setActiveAccount({ ...activeAccount, defaultRecipeShoppingListId });
      accountsApi.update(activeAccount.id, { defaultRecipeShoppingListId }).catch(console.error);
    },
    onCreateMember: createMember,
    onDeleteMember: (id: string) => softDeleteMember(id, currentMember.id),
    onDeleteOwnData: deleteOwnData,
    onUpdateMemberAvatar: updateMemberAvatar,
    onUpdateMemberColor: updateMemberColor,
    onUpdateMemberName: updateMemberName,
    onUpdateMemberTheme: updateMemberTheme,
    onUpdateMemberDarkMode: updateMemberDarkMode,
    onUpdateMemberTextSize: updateMemberTextSize,
    // Textstorlek, enhetsspecifik override (2026-08-10) — den inbäddade
    // ThemePickern i Inställningar → Utseende redigerar alltid currentMember
    // själv, samma delade handleTextSizeSelect som den flytande varianten
    // (Shell.tsx) så båda respekterar samma på/av-läge för denna enhet.
    textSize: textSizeDeviceOverride ?? currentMember.textSize ?? "normal",
    deviceTextSizeOverride: textSizeDeviceOverride !== null,
    onSelectTextSize: (textSize: TextSize) => handleTextSizeSelect(currentMember.id, textSize),
    onToggleDeviceTextSize: handleToggleDeviceTextSize,
    onUpdateMemberHiddenCrossAccountIds: updateMemberHiddenCrossAccountIds,
    onSetChildCredentials: setChildCredentials,
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
    // Enhetsspecifika (2026-08-10, Zaidas önskemål) — skriver bara till
    // localStorage på den här enheten, inte längre till kontot. Ett
    // kontovärde sparat innan denna ändring (om något) fortsätter gälla som
    // startpunkt tills man drar i reglaget här, se useDeviceSetting.ts.
    todoThreadGap: todoThreadGapDevice.value,
    onUpdateTodoThreadGap: (gap: number) => todoThreadGapDevice.setOverride(gap),
    todoBubbleSize: todoBubbleSizeDevice.value,
    onUpdateTodoBubbleSize: (size: number) => todoBubbleSizeDevice.setOverride(size),
    // Barn-tråden i Todos-panelen, av som standard (2026-07-31, Zaidas
    // önskemål) — en liten toggle här, samma updateMemberNavigation-mönster.
    showChildTodosInOwnView: currentMember.showChildTodosInOwnView ?? false,
    onUpdateShowChildTodosInOwnView: (value: boolean) =>
      updateMemberNavigation(currentMember.id, { showChildTodosInOwnView: value }),
    shoppingShowCompletedDefault: currentMember.shoppingShowCompletedDefault,
    onUpdateShoppingShowCompletedDefault: (value: boolean) =>
      updateMemberNavigation(currentMember.id, { shoppingShowCompletedDefault: value }),
    onUpdateChildTimelineSettings: updateChildTimelineSettings,
    onAssignRole: assignRole,
    onCreateRole: createRole,
    onTogglePermission: toggleRolePermission,
    onRestoreCalendar: restoreCalendar,
    onRestoreMember: restoreMember,
    onRestoreShoppingList: restoreShoppingList,
    onRestoreTodo: restoreTodo,
    // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av
    // papperskorgen. Alla fyra resurstyper töms parallellt i ETT klick,
    // matchar Zaidas egna ord ("radera ALLA raderade saker").
    onPurgeAllTrash: () =>
      Promise.all([purgeMembersTrash(), purgeShoppingTrash(), purgeCalendarsTrash(), purgeTodosTrash()]).then(
        () => undefined
      ),
    // Samma ADR-0025-undantag, per rad (2026-08-05, Zaidas önskemål: "en
    // möjlighet att ångra eller att göra en hard delete" per uppgift).
    onPurgeTodo: purgeTodo,
    onDeleteAccount: deleteAccount,
    onCreateWish: createWish,
    onCreateTodo: createTodo,
    onUpdateTodo: updateTodo,
    onRefreshRoutine: refreshRoutineOccurrence,
    onDeleteTodo: (id: string) => softDeleteTodo(id, currentMember, roles),
    // Manuell ordning på återkommande mallar i Inställningar (2026-07-28,
    // Zaidas önskemål: "ändra ordning på dem") — samma updateMemberNavigation-
    // mönster som onReorderThreads/todoThreadOrder.
    recurringTemplateOrder: currentMember.recurringTemplateOrder ?? [],
    onReorderRecurringTemplates: (order: Id[]) =>
      updateMemberNavigation(currentMember.id, { recurringTemplateOrder: order }),
    // Samma mönster, för mallbibliotekets fristående uppgiftsmallar
    // (2026-07-29, Zaidas önskemål: "flytta ordningen snabbt i uppgiftsmallarna").
    taskTemplateOrder: currentMember.taskTemplateOrder ?? [],
    onReorderTaskTemplates: (order: Id[]) =>
      updateMemberNavigation(currentMember.id, { taskTemplateOrder: order }),
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
    onUpdateTaskTemplate: updateTaskTemplate,
    onRemoveCategoryTemplate: removeCategoryTemplate,
    onUpdateCategoryTemplate: updateCategoryTemplate,
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
    panelNavResetKey,
    themePickerMember,
    handleThemeSelect,
    handleDarkModeToggle,
    handleTextSizeSelect,
    // Enhetsspecifik textstorlek (2026-08-10) — se kommentaren ovanför
    // textSizeDevice. null = ingen override, följ visibleThemeMember.textSize
    // som förut.
    textSizeDeviceOverride,
    handleToggleDeviceTextSize,
    closeThemePicker: () => setThemePickerMemberId(null),
    apiError,
    childContentProps,
    memberContentProps,
    settingsProps,
    fontId,
    setFontId,
    recordCelebration,
    dismissRecordCelebration: () => setRecordCelebration(null),
    shopSettings: {
      requireApprovalForCategories,
      updateSettings: updateShopSettings,
      items: shopItems,
      purchaseVersion,
      onPurchaseReward: purchaseReward,
    },
  };
}
