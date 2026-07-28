import "./Settings.css";
import { lazy, useState } from "react";
import { Baby, CalendarDays, ChefHat, KeyRound, ListTodo, LogOut, Palette, ShoppingCart, UserCog, Users } from "lucide-react";
import { RecipeImportExport } from "../recipes/RecipeImportExport";
import { RecipeShoppingListSettings } from "../recipes/RecipeShoppingListSettings";
import { AccountSetup } from "../accounts/AccountSetup";
import { SettingsCategoryNav } from "./SettingsCategoryNav";
import type { SettingsCategory } from "./SettingsCategoryNav";
import { LogoutConfirmModal } from "./LogoutConfirmModal";
import { ThemePicker } from "../../components/ThemePicker";
import { RewardShopSettings } from "../rewards/RewardShopSettings";
import { TodoHistory } from "../todos/TodoHistory";
import { TodoImportExport } from "../todos/TodoImportExport";
import { RecurringTodosSettings } from "../todos/RecurringTodosSettings";
import { OneOffTodosSettings } from "../todos/OneOffTodosSettings";
import { MyMembershipsSettings } from "../members/MyMembershipsSettings";
import { HouseholdSecretsSettings } from "../settings/HouseholdSecretsSettings";
import { HouseholdPinGate } from "../settings/HouseholdPinGate";
import { useHouseholdPin } from "../settings/useHouseholdPin";
import { TemplatesSettings } from "../todos/TemplatesSettings";
import { TimedTaskSettings } from "../timedTasks/TimedTaskSettings";
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
};

export function SettingsContent({ settingsProps, memberContentProps, onLogout }: Props) {
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
    shoppingShowCompletedDefault,
    onUpdateShoppingShowCompletedDefault,
    personalCategories,
    onCreateCategory,
    onSetCategoryHidden,
    taskTemplates,
    categoryTemplates,
    onCreateTaskTemplate,
    onRemoveTaskTemplate,
    onRemoveCategoryTemplate,
    onCreateTodo,
    onUpdateTodo,
    onDeleteTodo,
    todoImportResult,
    onSetTodoImportResult,
    todoImportUndo,
    onSetTodoImportUndo,
  } = settingsProps;

  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  // Extra lås för Hushåll-kategorin (2026-07-25) — EN instans här (inte i
  // HouseholdPinGate.tsx) så upplåst-state delas mellan Lösenord/Abonnemang.
  const householdPin = useHouseholdPin();

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
              <ThemePicker
                compact
                member={currentMember}
                onSelectTheme={(themeId) => settingsProps.onUpdateMemberTheme(currentMember.id, themeId)}
                onToggleDarkMode={(darkMode) => settingsProps.onUpdateMemberDarkMode(currentMember.id, darkMode)}
                onSelectTextSize={(textSize) => settingsProps.onUpdateMemberTextSize(currentMember.id, textSize)}
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
                <label className="field-label settings-todo-view-mode">
                  Avstånd mellan kategoritrådarna ({todoThreadGap ?? 8} px)
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
                  Bubblornas storlek ({todoBubbleSize ?? 96} px)
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
            </>
          )
        }
      ]
    },
    {
      id: "family",
      label: "Familj",
      icon: <Users aria-hidden="true" size={22} />,
      subcategories: [
        {
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
                onUpdateCalendarSettings={settingsProps.onUpdateCalendarSettings}
                onUpdateFixedTodoTimes={settingsProps.onUpdateFixedTodoTimes}
                onShareCalendar={memberContentProps.onShareCalendar}
                onRemoveCalendarShare={memberContentProps.onRemoveCalendarShare}
              />
              {canManageMembers && (
                <div className="settings-sub">
                  <InviteForm accountId={activeAccount.id} roles={roles} />
                </div>
              )}
            </>
          )
        },
        {
          id: "my-memberships",
          label: "Mina familjekonton",
          content: (
            <MyMembershipsSettings
              currentMember={currentMember}
              onUpdateHiddenCrossAccountIds={settingsProps.onUpdateMemberHiddenCrossAccountIds}
            />
          )
        },
        ...(canManageRoles
          ? [
              {
                id: "roles",
                label: "Roller & behörigheter",
                content: (
                  <RoleEditor
                    members={members}
                    roles={roles}
                    onAssignRole={settingsProps.onAssignRole}
                    onCreateRole={settingsProps.onCreateRole}
                    onTogglePermission={settingsProps.onTogglePermission}
                  />
                )
              }
            ]
          : [])
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
              account={activeAccount}
              onCreateFamily={settingsProps.onCreateFamily}
              onUpdateAccount={settingsProps.onUpdateAccount}
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
                    shoppingLists={shoppingLists}
                    onRestoreCalendar={settingsProps.onRestoreCalendar}
                    onRestoreMember={settingsProps.onRestoreMember}
                    onRestoreShoppingList={settingsProps.onRestoreShoppingList}
                    onRestoreTodo={settingsProps.onRestoreTodo}
                    onPurgeAllTrash={settingsProps.onPurgeAllTrash}
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
          id: "logout",
          label: "Logga ut",
          icon: <LogOut aria-hidden="true" size={16} />,
          variant: "danger",
          onSelect: () => setLogoutConfirmOpen(true)
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
              onAddSubscription={memberContentProps.onAddSubscription}
              onUpdateSubscription={memberContentProps.onUpdateSubscription}
              onRemoveSubscription={memberContentProps.onRemoveSubscription}
              onSyncSubscription={memberContentProps.onSyncSubscription}
              onUpdateCalendarKeepAllHistory={memberContentProps.onUpdateCalendarKeepAllHistory}
              onConnectAppleCalDav={memberContentProps.onConnectAppleCalDav}
              onDisconnectCalDav={memberContentProps.onDisconnectCalDav}
              onUpdateCalDavInterval={memberContentProps.onUpdateCalDavInterval}
              onSyncCalDavNow={memberContentProps.onSyncCalDavNow}
            />
          )
        }
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
                onShareList={memberContentProps.onShareShoppingList}
                onRemoveListShare={memberContentProps.onRemoveShoppingListShare}
                onToggleItem={memberContentProps.onToggleShoppingItem}
              />
            </>
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
              onUpdateTodo={onUpdateTodo}
              onCreateCategory={onCreateCategory}
              onCreateTaskTemplate={onCreateTaskTemplate}
              onDeleteTodo={onDeleteTodo}
              onRefreshRoutine={settingsProps.onRefreshRoutine}
              fixedTodoTimes={activeAccount.fixedTodoTimes ?? false}
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
              onRemoveCategoryTemplate={onRemoveCategoryTemplate}
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
              todos={todos}
              categories={personalCategories}
              onCreateTodo={onCreateTodo}
              onUpdateTodo={onUpdateTodo}
              onDeleteTodo={onDeleteTodo}
              onCreateCategory={onCreateCategory}
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
    }
  ];

  return (
    <>
      <SettingsCategoryNav
        categories={categories}
        onCategoryChange={(categoryId) => { if (categoryId !== "household") householdPin.lock(); }}
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
