import "./Settings.css";
import { lazy, useState } from "react";
import { ArrowLeftRight, Baby, Cake, CalendarDays, ChefHat, KeyRound, ListTodo, LogOut, Palette, ShoppingCart, UserCog, Users } from "lucide-react";
import { RecipeImportExport } from "../recipes/RecipeImportExport";
import { ShoppingImportExport } from "../shopping/ShoppingImportExport";
import { RecipeShoppingListSettings } from "../recipes/RecipeShoppingListSettings";
import { AccountSetup } from "../accounts/AccountSetup";
import { SettingsCategoryNav } from "./SettingsCategoryNav";
import type { SettingsCategory } from "./SettingsCategoryNav";
import { useSettingsNavSync } from "./useSettingsNavSync";
import { LogoutConfirmModal } from "./LogoutConfirmModal";
import { ThemePicker } from "../../components/ThemePicker";
import { RewardShopSettings } from "../rewards/RewardShopSettings";
import { RewardShopImportExport } from "../rewards/RewardShopImportExport";
import { TodoHistory } from "../todos/TodoHistory";
import { TodoImportExport } from "../todos/TodoImportExport";
import { RecurringTodosSettings } from "../todos/RecurringTodosSettings";
import { OneOffTodosSettings } from "../todos/OneOffTodosSettings";
import { MyMembershipsSettings } from "../members/MyMembershipsSettings";
import { FamilyViewSettings } from "../members/FamilyViewSettings";
import { FamilyConnectionSettings } from "../accounts/FamilyConnectionSettings";
import { HouseholdSecretsSettings } from "../settings/HouseholdSecretsSettings";
import { BirthdaysSettings } from "../settings/BirthdaysSettings";
import { HouseholdPinGate } from "../settings/HouseholdPinGate";
import { useHouseholdPin } from "../settings/useHouseholdPin";
import { TemplatesSettings } from "../todos/TemplatesSettings";
import { TimedTaskSettings } from "../timedTasks/TimedTaskSettings";
import { TimedTaskImportExport } from "../timedTasks/TimedTaskImportExport";
import type { useShellState } from "../../hooks/useShellState";

const AccountSettings = lazy(() =>
  import("../accounts/AccountSettings").then((m) => ({ default: m.AccountSettings }))
);
const CalendarPanel = lazy(() =>
  import("../calendars/CalendarPanel").then((m) => ({ default: m.CalendarPanel }))
);
const ChildSettings = lazy(() =>
  import("../children/ChildSettings").then((m) => ({ default: m.ChildSettings }))
);
const ChildApprovalSettings = lazy(() =>
  import("../children/ChildApprovalSettings").then((m) => ({ default: m.ChildApprovalSettings }))
);
const ChildDataSettings = lazy(() =>
  import("../children/ChildDataSettings").then((m) => ({ default: m.ChildDataSettings }))
);
const DeleteAccountSection = lazy(() =>
  import("../accounts/DeleteAccountSection").then((m) => ({ default: m.DeleteAccountSection }))
);
const InviteForm = lazy(() =>
  import("../invitations/InviteForm").then((m) => ({ default: m.InviteForm }))
);
const RoleEditor = lazy(() =>
  import("../roles/RoleEditor").then((m) => ({ default: m.RoleEditor }))
);
const ShoppingListsPanel = lazy(() =>
  import("../shopping/ShoppingListsPanel").then((m) => ({ default: m.ShoppingListsPanel }))
);
const TrashView = lazy(() =>
  import("../trash/TrashView").then((m) => ({ default: m.TrashView }))
);
const AuditLogSettings = lazy(() =>
  import("../settings/AuditLogSettings").then((m) => ({ default: m.AuditLogSettings }))
);

type ShellState = ReturnType<typeof useShellState>;

type Props = {
  settingsProps: ShellState["settingsProps"];
  memberContentProps: ShellState["memberContentProps"];
  onLogout: () => Promise<void>;
  onSwitchAccount: () => void;
};

export function SettingsContent({ settingsProps, memberContentProps, onLogout, onSwitchAccount }: Props) {
  const {
    account: activeAccount,
    currentMember,
    members,
    roles,
    todos,
    rewards,
    calendars,
    shoppingLists,
    recipes,
    onImportRecipes,
    onUpdateDefaultRecipeShoppingList,
    canManageMembers,
    canManageRoles,
    canSeeMembers,
    canViewTrash,
    fontId,
    setFontId,
    shopItems,
    purchasedItems,
    purchasedTotal,
    purchasedLoading,
    loadMorePurchased,
    onAddShopItem,
    onUpdateShopItem,
    onRemoveShopItem,
    onMovePurchased,
    onDeletePurchased,
    onUpdateWish,
    timedTasks,
    onCreateTimedTask,
    onRemoveTimedTask,
    todoViewMode,
    onUpdateTodoViewMode,
    todoThreadRange,
    onUpdateTodoThreadRange,
    todoThreadGap,
    onUpdateTodoThreadGap,
    todoBubbleSize,
    onUpdateTodoBubbleSize,
    showChildTodosInOwnView,
    onUpdateShowChildTodosInOwnView,
    shoppingShowCompletedDefault,
    onUpdateShoppingShowCompletedDefault,
    personalCategories,
    onCreateCategory,
    onSetCategoryHidden,
    onSetCategoryExcludeFromWeekOverview,
    taskTemplates,
    categoryTemplates,
    onCreateTaskTemplate,
    onRemoveTaskTemplate,
    onUpdateTaskTemplate,
    onRemoveCategoryTemplate,
    onUpdateCategoryTemplate,
    onCreateTodo,
    onUpdateTodo,
    onDeleteTodo,
    recurringTemplateOrder,
    onReorderRecurringTemplates,
    taskTemplateOrder,
    onReorderTaskTemplates,
    todoImportResult,
    onSetTodoImportResult,
    todoImportUndo,
    onSetTodoImportUndo,
  } = settingsProps;

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  // Extra lås för Hushåll-kategorin (2026-07-25) — EN instans här (inte i
  // HouseholdPinGate.tsx) så upplåst-state delas mellan Lösenord/Abonnemang.
  const householdPin = useHouseholdPin();
  const settingsNav = useSettingsNavSync();

  // Låser om Hushåll-kategorins PIN så fort man LÄMNAR den (2026-07-25,
  // "tills jag byter vy") — se useHouseholdPin.ts. Bara openCategory/
  // backToCategories byter faktisk kategori (openSub/backToSubcategories
  // rör sig inom SAMMA kategori), så bara de två behöver låsa om.
  function openCategory(categoryId: string, subId: string | null) {
    if (categoryId !== "household") householdPin.lock();
    settingsNav.openCategory(categoryId, subId);
  }
  function backToCategories() {
    householdPin.lock();
    settingsNav.backToCategories();
  }

  const hiddenCategories = personalCategories.filter((c) => c.hidden);

  // Sju kategorier istället för 18 platta, oberoende accordion-sektioner
  // (2026-07-22, Zaidas önskemål) — se SettingsCategoryNav.tsx. Den
  // ursprungliga samlade "Konto & familj" delades 2026-07-26 (Zaidas
  // önskemål: "en separat knapp bara för utseende, en för familj/roller/
  // familjemedlemmar") i tre egna toppnivåer: Utseende (tema/todo-vy, bara
  // EN underkategori — hoppar rakt förbi underkategori-listan precis som
  // Kalender/Inköpslistor redan gjorde), Familj (medlemmar, mina
  // familjekonton, roller) och Konto (namn, aktivitetslogg, papperskorg,
  // radera/logga ut — det som blev kvar).
  const categories: SettingsCategory[] = [
    {
      id: "appearance",
      label: "Utseende",
      icon: <Palette aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "appearance",
          label: "Utseende",
          content: (
            <>
              {/* Textstorlek (2026-08-10) — samma delade handleTextSizeSelect
                  som den flytande varianten (Shell.tsx via settingsProps.
                  onSelectTextSize), så en enhetsspecifik override respekteras
                  oavsett vilken av de två man använder. */}
              <ThemePicker
                compact
                member={currentMember}
                onSelectTheme={(themeId) => settingsProps.onUpdateMemberTheme(currentMember.id, themeId)}
                onToggleDarkMode={(darkMode) => settingsProps.onUpdateMemberDarkMode(currentMember.id, darkMode)}
                onSelectTextSize={settingsProps.onSelectTextSize}
                textSize={settingsProps.textSize}
                deviceTextSizeOverride={settingsProps.deviceTextSizeOverride}
                onToggleDeviceTextSize={settingsProps.onToggleDeviceTextSize}
                fontId={fontId}
                onSelectFont={setFontId}
              />
              <label className="field-label settings-todo-view-mode">
                Todos-vy
                <select
                  className="text-input"
                  onChange={(e) => onUpdateTodoViewMode(e.target.value as "list" | "thread")}
                  value={todoViewMode}
                >
                  <option value="thread">Bollar i tråd</option>
                  <option value="list">Lista</option>
                </select>
              </label>
              {/* Gäller nu BÅDA vyerna (2026-07-27, Zaidas önskemål: "todo i
                  inställningar ska gå att välja bara dagens eller samtliga
                  även i listvy") — tidigare dold i listläget, som alltid
                  visade allt oavsett datum. Väljer man "Allt i framtiden"
                  motsvarar det exakt listlägets gamla, oförändrade
                  beteende. */}
              <label className="field-label settings-todo-view-mode">
                Hur mycket ska visas?
                <select
                  className="text-input"
                  onChange={(e) =>
                    onUpdateTodoThreadRange(e.target.value as "today" | "week" | "month" | "all")
                  }
                  value={todoThreadRange}
                >
                  <option value="today">Bara idag</option>
                  <option value="week">En vecka framåt</option>
                  <option value="month">En månad framåt</option>
                  <option value="all">Allt i framtiden</option>
                </select>
              </label>
              {todoViewMode === "thread" && (
                // Enhetsspecifikt sedan 2026-08-10 (Zaidas önskemål) — sparas
                // bara på den här enheten, inte längre synkat till kontot.
                <label className="field-label settings-todo-view-mode">
                  Avstånd mellan kategoritrådarna ({todoThreadGap ?? 8} px, bara på den här enheten)
                  <input
                    className="settings-thread-gap-slider"
                    max={32}
                    min={0}
                    onChange={(e) => onUpdateTodoThreadGap(Number(e.target.value))}
                    type="range"
                    value={todoThreadGap ?? 8}
                  />
                </label>
              )}
              {todoViewMode === "thread" && (
                <label className="field-label settings-todo-view-mode">
                  Bubblornas storlek ({todoBubbleSize ?? 96} px, bara på den här enheten)
                  <input
                    className="settings-thread-gap-slider"
                    max={160}
                    min={64}
                    onChange={(e) => onUpdateTodoBubbleSize(Number(e.target.value))}
                    type="range"
                    value={todoBubbleSize ?? 96}
                  />
                </label>
              )}
              {/* Barn-tråden döljs som standard i Todos-panelen (2026-07-31,
                  Zaidas önskemål: "i min egen todo vy skall endast mina egna
                  todos finnas... möjlighet att i mina inställningar välja
                  att visa barnens todon... som en liten toggle knapp"). */}
              <label className="field-label toggle-label">
                <span>Visa barnens uppgifter i Todos-panelen</span>
                <input
                  checked={showChildTodosInOwnView}
                  onChange={(e) => onUpdateShowChildTodosInOwnView(e.target.checked)}
                  type="checkbox"
                />
              </label>
            </>
          )
        }
      ]
    },
    {
      id: "account",
      label: "Konto",
      icon: <UserCog aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "account-name",
          label: "Konto",
          content: (
            <AccountSetup
              currentMember={currentMember}
              myAvatarUrl={settingsProps.myAvatarUrl}
              onUpdateMyAvatar={settingsProps.onUpdateMyAvatar}
            />
          )
        },
        ...(canManageMembers
          ? [
              {
                id: "audit-log",
                label: "🗂 Aktivitetslogg",
                content: <AuditLogSettings enabled={canManageMembers} />
              }
            ]
          : []),
        ...(canViewTrash
          ? [
              {
                id: "trash",
                label: "Papperskorg",
                content: (
                  <TrashView
                    calendars={calendars}
                    currentMember={currentMember}
                    members={members}
                    roles={roles}
                    onRestoreCalendar={settingsProps.onRestoreCalendar}
                    onRestoreMember={settingsProps.onRestoreMember}
                    onRestoreShoppingList={settingsProps.onRestoreShoppingList}
                    onRestoreTodo={settingsProps.onRestoreTodo}
                    onPurgeAllTrash={settingsProps.onPurgeAllTrash}
                    onPurgeTodo={settingsProps.onPurgeTodo}
                  />
                )
              }
            ]
          : []),
        {
          id: "delete-account",
          label: "Radera konto",
          content: (
            <div className="settings-sub">
              <DeleteAccountSection
                accountId={activeAccount.id}
                accountName={activeAccount.name}
                onConfirm={settingsProps.onDeleteAccount}
              />
            </div>
          )
        },
        {
          // 2026-08-11, flyttad hit från en oskyltad ikonknapp i sidonavet
          // (Zaidas fynd: "jag trycker på det som hemknappen skall göra" —
          // se HeroBar.tsx för hela bakgrunden). Samma onSwitchAccount-
          // funktion som tidigare, bara en tydligt skyltad plats istället.
          id: "switch-account",
          label: "Byt vy",
          icon: <ArrowLeftRight aria-hidden="true" size={16} />,
          onSelect: onSwitchAccount
        },
        {
          id: "logout",
          label: "Logga ut",
          icon: <LogOut aria-hidden="true" size={16} />,
          variant: "danger",
          onSelect: () => setLogoutConfirmOpen(true)
        }
      ]
    },
    {
      id: "family",
      label: "Familj",
      icon: <Users aria-hidden="true" size={22} />,
      subcategories: [
        {
          // 2026-08-11, Story 2-flikkonsolidering (se docs/.../2026-08-11-
          // installningar-familjekonto-omorganisation.md) — Roller &
          // behörigheter (RoleEditor.tsx) slogs ihop hit, avgränsat till BARA
          // dessa två (Zaidas val): medlemslista och rolltilldelning är
          // genuint samma ansvarsområde (administrera familjens medlemmar),
          // till skillnad från Barn → Barnkonton (ChildSettings.tsx, önskningar
          // + dashboard-tema för REDAN skapade barn — ett annat ämne,
          // medvetet uppdelat från Godkännande/Data redan 2026-07-28,
          // rördes INTE av denna sammanslagning). RoleEditor gated på
          // canManageRoles INUTI innehållet istället för som en egen
          // array-villkorad flik, samma mönster som AccountSettings.tsx
          // redan använder internt för sina canManageMembers-sektioner.
          id: "members",
          label: "Familjemedlemmar",
          content: (
            <>
              <AccountSettings
                account={activeAccount}
                currentMember={currentMember}
                members={members}
                roles={roles}
                calendars={calendars}
                onCreateMember={settingsProps.onCreateMember}
                onDeleteMember={settingsProps.onDeleteMember}
                onDeleteOwnData={settingsProps.onDeleteOwnData}
                onUpdateMemberAvatar={settingsProps.onUpdateMemberAvatar}
                onUpdateMemberColor={settingsProps.onUpdateMemberColor}
                onUpdateMemberName={settingsProps.onUpdateMemberName}
                onSetChildCredentials={settingsProps.onSetChildCredentials}
                onAssignRole={settingsProps.onAssignRole}
                onUpdateCalendarSettings={settingsProps.onUpdateCalendarSettings}
                onUpdateFixedTodoTimes={settingsProps.onUpdateFixedTodoTimes}
                onUpdateFixedCalendarTimes={settingsProps.onUpdateFixedCalendarTimes}
                onUpdateAccount={settingsProps.onUpdateAccount}
                onShareCalendar={memberContentProps.onShareCalendar}
                onRemoveCalendarShare={memberContentProps.onRemoveCalendarShare}
                onSetDashboardVisibility={memberContentProps.onSetDashboardVisibility}
                onRemoveDashboardVisibility={memberContentProps.onRemoveDashboardVisibility}
              />
              {canManageMembers && (
                <div className="settings-sub">
                  <InviteForm accountId={activeAccount.id} roles={roles} />
                </div>
              )}
              {canManageRoles && (
                <RoleEditor
                  members={members}
                  roles={roles}
                  onAssignRole={settingsProps.onAssignRole}
                  onCreateRole={settingsProps.onCreateRole}
                  onTogglePermission={settingsProps.onTogglePermission}
                />
              )}
            </>
          )
        },
        // Gated på canSeeMembers (2026-08-11, Zaidas önskemål: "samtliga
        // familjemedlemmar som har behörighet skall kunna se ... familjekonton"
        // — tidigare synlig för ALLA oavsett behörighet). Samma befintliga
        // permission som redan styr "Se medlemsvyn (andras dashboard)" i
        // Hem-vyn (canSeeMembersPanel) — default PÅ för alla roller, så ingen
        // befintlig användare tappar åtkomst, men en roll där den stängts av
        // tappar den nu även här, konsekvent med resten av appen.
        ...(canSeeMembers
          ? [
              {
                id: "my-memberships",
                label: "Mina familjekonton",
                content: (
                  <MyMembershipsSettings
                    currentMember={currentMember}
                    onCreateFamily={settingsProps.onCreateFamily}
                    onLogout={onLogout}
                  />
                )
              }
            ]
          : []),
        ...(canManageMembers
          ? [
              {
                id: "family-connections",
                label: "Familjeanslutningar",
                content: <FamilyConnectionSettings accountId={activeAccount.id} members={members} />
              }
            ]
          : []),
        // Familjevy (2026-08-30, Zaidas önskemål: "Välj familj på dashboarden
        // skall flyttas till familj, där jag ska kunna välja vilka
        // familjeanslutningar som skall visas i familjevyn") — ersätter den
        // tidigare "Välj familj"-popupen i Hem-vyn (MemberOverview.tsx), se
        // FamilyViewSettings.tsx. Samma canSeeMembers-gate som "Mina
        // familjekonton" ovan, eftersom det är samma underliggande data.
        ...(canSeeMembers
          ? [
              {
                id: "family-view",
                label: "Familjevy",
                content: (
                  <FamilyViewSettings
                    currentMember={currentMember}
                    onUpdateHiddenConnectionAccountIds={settingsProps.onUpdateMemberHiddenConnectionAccountIds}
                    onUpdateHiddenCrossAccountIds={settingsProps.onUpdateMemberHiddenCrossAccountIds}
                  />
                )
              }
            ]
          : []),
        // Dashboard (2026-08-30, Zaidas önskemål: "jag vill kunna välja
        // vilka kategorier som inte skall synas där i dashboarden" — Hem-
        // vyns kompakta veckoöversikt, FamilyWeekRoutines.tsx, flödar ihop
        // om en kategori vars uppgifter återkommer VARJE dag (t.ex. en egen
        // "Rutiner"-kategori) visas där). Bara VIEWERNS EGNA, icke-gömda
        // kategorier — en redan gömd kategori (hidden=true) syns ändå
        // ingenstans, ingen poäng att erbjuda en till toggle för den.
        {
          id: "dashboard",
          label: "Dashboard",
          content: (
            <>
              <p className="field-hint">
                Välj vilka av dina kategorier som INTE ska synas i familjens dagsöversikt (idag + kommande
                dagar) på Hem-panelen. Kategorin och dess uppgifter påverkas inte i övrigt.
              </p>
              {personalCategories.filter((c) => !c.hidden).length === 0 ? (
                <p className="empty-note">Du har inga kategorier än.</p>
              ) : (
                <ul className="settings-hidden-categories">
                  {personalCategories
                    .filter((c) => !c.hidden)
                    .map((category) => (
                      <li className="settings-hidden-categories__row" key={category.id}>
                        <label>
                          <input
                            checked={!category.excludeFromWeekOverview}
                            onChange={(e) =>
                              onSetCategoryExcludeFromWeekOverview(category.id, !e.target.checked)
                            }
                            type="checkbox"
                          />
                          {" "}{category.name}
                        </label>
                      </li>
                    ))}
                </ul>
              )}
            </>
          )
        }
      ]
    },
    {
      id: "calendar",
      label: "Kalender",
      icon: <CalendarDays aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "calendars",
          label: "Kalendrar",
          content: (
            <CalendarPanel
              managementOnly
              calendars={calendars}
              currentMember={currentMember}
              members={members}
              roles={roles}
              onAddEvent={memberContentProps.onAddCalendarEvent}
              onCreateCalendar={memberContentProps.onCreateCalendar}
              onUpdateCalendarColor={memberContentProps.onUpdateCalendarColor}
              onRenameCalendar={memberContentProps.onRenameCalendar}
              onTransferCalendar={memberContentProps.onTransferCalendar}
              onDeleteCalendar={memberContentProps.onDeleteCalendar}
              onImportCalendar={memberContentProps.onImportCalendar}
              onShareCalendar={memberContentProps.onShareCalendar}
              onRemoveCalendarShare={memberContentProps.onRemoveCalendarShare}
              onSetDashboardVisibility={memberContentProps.onSetDashboardVisibility}
              onRemoveDashboardVisibility={memberContentProps.onRemoveDashboardVisibility}
              onAddSubscription={memberContentProps.onAddSubscription}
              onUpdateSubscription={memberContentProps.onUpdateSubscription}
              onRemoveSubscription={memberContentProps.onRemoveSubscription}
              onSyncSubscription={memberContentProps.onSyncSubscription}
              onUpdateCalendarKeepAllHistory={memberContentProps.onUpdateCalendarKeepAllHistory}
              onUpdateCalendarShareAcrossMyAccounts={memberContentProps.onUpdateCalendarShareAcrossMyAccounts}
              appleAccounts={memberContentProps.appleAccounts}
              onRefreshAppleAccounts={memberContentProps.onRefreshAppleAccounts}
              onAddAppleAccount={memberContentProps.onAddAppleAccount}
              onRemoveAppleAccount={memberContentProps.onRemoveAppleAccount}
              onListCalendarsForAppleAccount={memberContentProps.onListCalendarsForAppleAccount}
              onConnectAppleCalDav={memberContentProps.onConnectAppleCalDav}
              onDisconnectCalDav={memberContentProps.onDisconnectCalDav}
              onUpdateCalDavInterval={memberContentProps.onUpdateCalDavInterval}
              onSyncCalDavNow={memberContentProps.onSyncCalDavNow}
            />
          )
        }
      ]
    },
    // Egen toppnivå-kategori (2026-08-09, Zaidas rättelse: "Lyft ut
    // 'födelsedagar' till en egen kategori i inställningar, istället för en
    // underkategori under kalender") — låg tidigare (2026-08-07) som en
    // underkategori under Kalender, flyttad hit ut igen. Bara EN
    // underkategori, så SettingsCategoryNav.tsx:s "hoppa rakt förbi
    // underkategori-listan"-genväg (samma som Utseende/Kalendrar) gäller
    // automatiskt.
    {
      id: "birthdays",
      label: "🎂 Födelsedagar",
      icon: <Cake aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "birthdays",
          label: "🎂 Födelsedagar",
          content: <BirthdaysSettings />
        }
      ]
    },
    {
      id: "todos",
      label: "Todo-lista",
      icon: <ListTodo aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "history",
          label: "📋 Todo-historik",
          content: (
            <TodoHistory currentMember={currentMember} roles={roles} allMembers={members} />
          )
        },
        {
          id: "recurring",
          label: "🔁 Återkommande uppgifter",
          content: (
            <RecurringTodosSettings
              currentMember={currentMember}
              members={members}
              roles={roles}
              todos={todos}
              categories={personalCategories}
              taskTemplates={taskTemplates}
              categoryTemplates={categoryTemplates}
              onUpdateTodo={onUpdateTodo}
              onCreateTodo={onCreateTodo}
              onCreateCategory={onCreateCategory}
              onCreateTaskTemplate={onCreateTaskTemplate}
              onDeleteTodo={onDeleteTodo}
              onRefreshRoutine={settingsProps.onRefreshRoutine}
              fixedTodoTimes={activeAccount.fixedTodoTimes ?? false}
              order={recurringTemplateOrder}
              onReorder={onReorderRecurringTemplates}
            />
          )
        },
        {
          id: "one-off",
          label: "📌 Engångsuppgifter",
          content: (
            <OneOffTodosSettings
              currentMember={currentMember}
              members={members}
              roles={roles}
              todos={todos}
              categories={personalCategories}
              onUpdateTodo={onUpdateTodo}
              onCreateCategory={onCreateCategory}
              onCreateTaskTemplate={onCreateTaskTemplate}
              onDeleteTodo={onDeleteTodo}
              onRefreshRoutine={settingsProps.onRefreshRoutine}
            />
          )
        },
        {
          id: "templates",
          label: "📋 Mallar",
          content: (
            <TemplatesSettings
              taskTemplates={taskTemplates}
              categoryTemplates={categoryTemplates}
              onRemoveTaskTemplate={onRemoveTaskTemplate}
              onUpdateTaskTemplate={onUpdateTaskTemplate}
              onRemoveCategoryTemplate={onRemoveCategoryTemplate}
              onUpdateCategoryTemplate={onUpdateCategoryTemplate}
              order={taskTemplateOrder}
              onReorder={onReorderTaskTemplates}
            />
          )
        },
        {
          id: "import-export",
          label: "📥 Importera/exportera uppgifter",
          content: (
            <TodoImportExport
              currentMember={currentMember}
              members={members}
              roles={roles}
              todos={todos}
              categories={personalCategories}
              onCreateTodo={onCreateTodo}
              onUpdateTodo={onUpdateTodo}
              onDeleteTodo={onDeleteTodo}
              onCreateCategory={onCreateCategory}
              onCreateTaskTemplate={onCreateTaskTemplate}
              onRefreshRoutine={settingsProps.onRefreshRoutine}
              result={todoImportResult}
              setResult={onSetTodoImportResult}
              lastImportUndo={todoImportUndo}
              setLastImportUndo={onSetTodoImportUndo}
            />
          )
        },
        ...(hiddenCategories.length > 0
          ? [
              {
                id: "hidden-categories",
                label: "🙈 Gömda kategorier",
                content: (
                  <ul className="settings-hidden-categories">
                    {hiddenCategories.map((category) => (
                      <li className="settings-hidden-categories__row" key={category.id}>
                        <span>{category.name}</span>
                        <button
                          className="secondary-button"
                          onClick={() => onSetCategoryHidden(category.id, false)}
                          type="button"
                        >
                          Visa igen
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              }
            ]
          : [])
      ]
    },
    {
      id: "shopping",
      label: "Inköpslistor",
      icon: <ShoppingCart aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "shopping-lists",
          label: "Inköpslistor",
          content: (
            <>
              {/* Standardläge för "Visa avklarade" i Inköp-panelen
                  (2026-07-27, Zaidas önskemål: "defaultläge skall gå att
                  ställa in under inköpslistorna i inställningarna") — gäller
                  bara listor utan ett eget, redan sparat val på DENNA enhet
                  (se ShoppingView.tsx, localStorage). */}
              <div className="settings-sub">
                <label className="field-label toggle-label">
                  <span>Visa avklarade som standard</span>
                  <input
                    checked={shoppingShowCompletedDefault ?? true}
                    onChange={(e) => onUpdateShoppingShowCompletedDefault(e.target.checked)}
                    type="checkbox"
                  />
                </label>
                <p className="settings-sub-desc">
                  Gäller listor du inte redan valt ett eget läge för på just den här enheten.
                </p>
              </div>
              <ShoppingListsPanel
                managementOnly
                currentMember={currentMember}
                members={members}
                roles={roles}
                shoppingLists={shoppingLists}
                onAddItem={memberContentProps.onAddShoppingItem}
                onCreateList={memberContentProps.onCreateShoppingList}
                onDeleteList={memberContentProps.onDeleteShoppingList}
                onRenameList={memberContentProps.onRenameShoppingList}
                onShareList={memberContentProps.onShareShoppingList}
                onRemoveListShare={memberContentProps.onRemoveShoppingListShare}
                onToggleItem={memberContentProps.onToggleShoppingItem}
              />
            </>
          )
        },
        {
          id: "shopping-import-export",
          label: "📥 Importera/exportera",
          content: (
            <ShoppingImportExport
              currentMemberId={currentMember.id}
              onImport={memberContentProps.onImportShoppingItems}
              shoppingLists={shoppingLists}
            />
          )
        }
      ]
    },
    {
      // Egen kategori för recept (2026-07-26, Zaidas önskemål: "recept ska
      // ha egen kategori i inställningar där man kan ladda ner, importera
      // och exportera... istället för i receptvyn") — importflödet låg
      // tidigare direkt i Recept-panelen, flyttat hit helt (samma
      // "panelen visar bara det man faktiskt gör där, resten i
      // Inställningar"-princip som redan gäller Todos, ADR 2026-07-05/06).
      id: "recipes",
      label: "Recept",
      icon: <ChefHat aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "recipes",
          label: "Import/export",
          content: <RecipeImportExport onImport={onImportRecipes} recipes={recipes} />
        },
        {
          // Standard-inköpslista (2026-07-27, Zaidas önskemål: se
          // RecipeShoppingListSettings.tsx för fullständigt resonemang).
          id: "shopping-list",
          label: "Standardlista",
          content: (
            <RecipeShoppingListSettings
              account={activeAccount}
              onUpdate={onUpdateDefaultRecipeShoppingList}
              shoppingLists={shoppingLists}
            />
          )
        }
      ]
    },
    {
      id: "household",
      label: "Hushåll",
      icon: <KeyRound aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "household-passwords",
          label: "Lösenord",
          content: (
            <HouseholdPinGate pinState={householdPin}>
              <HouseholdSecretsSettings kind="password" />
            </HouseholdPinGate>
          )
        },
        {
          id: "household-subscriptions",
          label: "Abonnemang",
          content: (
            <HouseholdPinGate pinState={householdPin}>
              <HouseholdSecretsSettings kind="subscription" />
            </HouseholdPinGate>
          )
        }
      ]
    },
    {
      id: "children",
      label: "Barn",
      icon: <Baby aria-hidden="true" size={22} />,
      subcategories: [
        {
          id: "child-settings",
          label: "Barnkonton",
          content: (
            <ChildSettings
              currentMember={currentMember}
              members={members}
              roles={roles}
              rewards={rewards}
              onCreateWish={settingsProps.onCreateWish}
              onApproveWish={settingsProps.onApproveWish}
              onRejectWish={settingsProps.onRejectWish}
              onUpdateWish={onUpdateWish}
              onUpdateChildTimelineSettings={settingsProps.onUpdateChildTimelineSettings}
            />
          )
        },
        {
          // 2026-07-28, Zaidas önskemål: en egen underkategori för
          // uppgifts-godkännande, separat från Barnkonton.
          id: "child-approval",
          label: "Godkännande av uppgifter",
          content: (
            <ChildApprovalSettings
              currentMember={currentMember}
              members={members}
              roles={roles}
              todos={todos}
              onApproveTodo={settingsProps.onApproveTodo}
              onRejectTodo={settingsProps.onRejectTodo}
            />
          )
        },
        {
          // 2026-07-28, Zaidas önskemål: "en som heter data... överföra
          // barn, dela barn, ... kopiera uppgifter till ett annat barn och
          // allt som har med datan att göra" — samlar rutinkopiering och
          // dela/överför-barn (fanns redan, låg spritt i Barnkonton).
          id: "child-data",
          label: "Data",
          content: (
            <ChildDataSettings
              currentMember={currentMember}
              members={members}
              roles={roles}
              todos={todos}
              categories={personalCategories}
              onCreateCategory={onCreateCategory}
              onCreateTodo={settingsProps.onCreateTodo}
              onUpdateTodo={settingsProps.onUpdateTodo}
              onRefreshRoutine={settingsProps.onRefreshRoutine}
              onDeleteTodo={settingsProps.onDeleteTodo}
              fixedTodoTimes={activeAccount.fixedTodoTimes ?? false}
            />
          )
        },
        {
          id: "timed-tasks",
          label: "🏃 Medaljer/Rekord",
          content: (
            <TimedTaskSettings
              timedTasks={timedTasks}
              children={members.filter((m) => m.deletedAt === null && m.isChild)}
              onCreate={onCreateTimedTask}
              onRemove={onRemoveTimedTask}
            />
          )
        },
        {
          id: "timed-tasks-import-export",
          label: "📥 Importera/exportera Medaljer/Rekord",
          content: (
            <TimedTaskImportExport
              timedTasks={timedTasks}
              children={members.filter((m) => m.deletedAt === null && m.isChild)}
              onCreate={onCreateTimedTask}
            />
          )
        },
        {
          id: "reward-shop",
          label: "🏪 Belöningsbutiken",
          content: (
            <RewardShopSettings
              items={shopItems}
              currentMemberId={currentMember.id}
              children={members.filter((m) => m.deletedAt === null && m.isChild)}
              todos={todos}
              categories={personalCategories}
              purchasedItems={purchasedItems}
              purchasedTotal={purchasedTotal}
              purchasedLoading={purchasedLoading}
              onLoadMore={loadMorePurchased}
              onAdd={onAddShopItem}
              onUpdate={onUpdateShopItem}
              onRemove={onRemoveShopItem}
              onMovePurchased={onMovePurchased}
              onDeletePurchased={onDeletePurchased}
            />
          )
        },
        {
          id: "reward-shop-import-export",
          label: "📥 Importera/exportera belöningar",
          content: (
            <RewardShopImportExport
              items={shopItems}
              categories={personalCategories}
              currentMemberId={currentMember.id}
              onAdd={onAddShopItem}
              onUpdate={onUpdateShopItem}
            />
          )
        }
      ]
    }
  ];

  return (
    <>
      <SettingsCategoryNav
        categories={categories}
        activeCategoryId={settingsNav.activeCategoryId}
        activeSubId={settingsNav.activeSubId}
        onOpenCategory={openCategory}
        onOpenSub={settingsNav.openSub}
        onBackToCategories={backToCategories}
        onBackToSubcategories={settingsNav.backToSubcategories}
      />
      {logoutConfirmOpen && (
        <LogoutConfirmModal
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={onLogout}
        />
      )}
    </>
  );
}
