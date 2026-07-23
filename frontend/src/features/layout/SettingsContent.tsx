import "./Settings.css";
import { lazy } from "react";
import { Baby, CalendarDays, ListTodo, LogOut, ShoppingCart, UserCog } from "lucide-react";
import { AccountSetup } from "../accounts/AccountSetup";
import { SettingsCategoryNav } from "./SettingsCategoryNav";
import type { SettingsCategory } from "./SettingsCategoryNav";
import { ThemePicker } from "../../components/ThemePicker";
import { RewardShopSettings } from "../rewards/RewardShopSettings";
import { TodoHistory } from "../todos/TodoHistory";
import { TodoImportExport } from "../todos/TodoImportExport";
import { RecurringTodosSettings } from "../todos/RecurringTodosSettings";
import { OneOffTodosSettings } from "../todos/OneOffTodosSettings";
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

  const hiddenCategories = personalCategories.filter((c) => c.hidden);

  // Fem kategorier istället för 18 platta, oberoende accordion-sektioner
  // (2026-07-22, Zaidas önskemål) — se SettingsCategoryNav.tsx. Konto samlar
  // allt kontobrett (namn, familjemedlemmar, roller, tema, aktivitetslogg,
  // papperskorg, radera/logga ut); Kalender/Inköpslistor har bara en egen
  // underkategori vardera och hoppar därför rakt förbi underkategori-listan.
  const categories: SettingsCategory[] = [
    {
      id: "account",
      label: "Konto & familj",
      icon: <UserCog aria-hidden="true" size={22} />,
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
              {todoViewMode === "thread" && (
                <label className="field-label settings-todo-view-mode">
                  Hur mycket ska visas i tråd-vyn?
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
              )}
            </>
          )
        },
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
          : []),
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
                    todos={todos}
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
          content: (
            <div className="settings-sub">
              <button className="settings-logout-btn" onClick={() => void onLogout()} type="button">
                <LogOut size={18} />
                Logga ut från Familjeappen
              </button>
            </div>
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
              onAddSubscription={memberContentProps.onAddSubscription}
              onUpdateSubscription={memberContentProps.onUpdateSubscription}
              onRemoveSubscription={memberContentProps.onRemoveSubscription}
              onSyncSubscription={memberContentProps.onSyncSubscription}
              onUpdateCalendarKeepAllHistory={memberContentProps.onUpdateCalendarKeepAllHistory}
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
            <TodoHistory currentMember={currentMember} roles={roles} todos={todos} allMembers={members} />
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
              todos={todos}
              rewards={rewards}
              categories={personalCategories}
              onCreateCategory={onCreateCategory}
              onCreateWish={settingsProps.onCreateWish}
              onApproveTodo={settingsProps.onApproveTodo}
              onRejectTodo={settingsProps.onRejectTodo}
              onApproveWish={settingsProps.onApproveWish}
              onRejectWish={settingsProps.onRejectWish}
              onUpdateWish={onUpdateWish}
              onCreateTodo={settingsProps.onCreateTodo}
              onUpdateTodo={settingsProps.onUpdateTodo}
              onUpdateChildTimelineSettings={settingsProps.onUpdateChildTimelineSettings}
              onRefreshRoutine={settingsProps.onRefreshRoutine}
              fixedTodoTimes={activeAccount.fixedTodoTimes ?? false}
              onDeleteTodo={settingsProps.onDeleteTodo}
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
    }
  ];

  return <SettingsCategoryNav categories={categories} />;
}
