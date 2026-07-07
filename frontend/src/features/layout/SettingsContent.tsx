import "./Settings.css";
import { lazy } from "react";
import { LogOut } from "lucide-react";
import { AccountSetup } from "../accounts/AccountSetup";
import { SettingsSection } from "./SettingsSection";
import { ThemePicker } from "../../components/ThemePicker";
import { RewardShopSettings } from "../rewards/RewardShopSettings";
import { TodoHistory } from "../todos/TodoHistory";
import { TodoImportExport } from "../todos/TodoImportExport";
import { RecurringTodosSettings } from "../todos/RecurringTodosSettings";
import { OneOffTodosSettings } from "../todos/OneOffTodosSettings";
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
    onCreateTodo,
    onUpdateTodo,
    onDeleteTodo,
    todoImportResult,
    onSetTodoImportResult,
    todoImportUndo,
    onSetTodoImportUndo,
  } = settingsProps;

  const hiddenCategories = personalCategories.filter((c) => c.hidden);

  return (
    <div className="settings-accordion">
      <SettingsSection title="Utseende" defaultOpen>
        <ThemePicker
          compact
          member={currentMember}
          onSelectTheme={(themeId) => settingsProps.onUpdateMemberTheme(currentMember.id, themeId)}
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
      </SettingsSection>

      <SettingsSection title="🏪 Belöningsbutiken" defaultOpen>
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
      </SettingsSection>

      <SettingsSection title="Konto">
        <AccountSetup account={activeAccount} onUpdateAccount={settingsProps.onUpdateAccount} />
      </SettingsSection>

      <SettingsSection title="Familjemedlemmar">
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
          onUpdateCalendarSettings={settingsProps.onUpdateCalendarSettings}
          onShareCalendar={memberContentProps.onShareCalendar}
          onRemoveCalendarShare={memberContentProps.onRemoveCalendarShare}
        />
        {canManageMembers && (
          <div className="settings-sub">
            <InviteForm accountId={activeAccount.id} roles={roles} />
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="🏃 Medaljer/Rekord">
        <TimedTaskSettings
          timedTasks={timedTasks}
          children={members.filter((m) => m.deletedAt === null && m.isChild)}
          onCreate={onCreateTimedTask}
          onRemove={onRemoveTimedTask}
        />
      </SettingsSection>

      <SettingsSection title="📋 Todo-historik">
        <TodoHistory
          currentMember={currentMember}
          roles={roles}
          todos={todos}
          allMembers={members}
        />
      </SettingsSection>

      <SettingsSection title="🔁 Återkommande uppgifter">
        <RecurringTodosSettings
          currentMember={currentMember}
          members={members}
          roles={roles}
          todos={todos}
          categories={personalCategories}
          onUpdateTodo={onUpdateTodo}
          onCreateCategory={onCreateCategory}
          onDeleteTodo={onDeleteTodo}
        />
      </SettingsSection>

      <SettingsSection title="📌 Engångsuppgifter">
        <OneOffTodosSettings
          currentMember={currentMember}
          members={members}
          roles={roles}
          todos={todos}
          categories={personalCategories}
          onUpdateTodo={onUpdateTodo}
          onCreateCategory={onCreateCategory}
          onDeleteTodo={onDeleteTodo}
        />
      </SettingsSection>

      <SettingsSection title="📥 Importera/exportera uppgifter">
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
      </SettingsSection>

      {hiddenCategories.length > 0 && (
        <SettingsSection title="🙈 Gömda kategorier">
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
        </SettingsSection>
      )}

      <SettingsSection title="Barn">
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
          onDeleteTodo={settingsProps.onDeleteTodo}
        />
      </SettingsSection>

      <SettingsSection title="Kalendrar">
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
      </SettingsSection>

      <SettingsSection title="Inköpslistor">
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
      </SettingsSection>

      {canManageRoles && (
        <SettingsSection title="Roller & behörigheter">
          <RoleEditor
            members={members}
            roles={roles}
            onAssignRole={settingsProps.onAssignRole}
            onCreateRole={settingsProps.onCreateRole}
            onTogglePermission={settingsProps.onTogglePermission}
          />
        </SettingsSection>
      )}

      {canManageMembers && (
        <SettingsSection title="🗂 Aktivitetslogg">
          <AuditLogSettings enabled={canManageMembers} />
        </SettingsSection>
      )}

      {canViewTrash && (
        <SettingsSection title="Papperskorg">
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
          />
        </SettingsSection>
      )}

      <SettingsSection title="Radera konto">
        <div className="settings-sub">
          <DeleteAccountSection
            accountId={activeAccount.id}
            accountName={activeAccount.name}
            onConfirm={settingsProps.onDeleteAccount}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Logga ut">
        <div className="settings-sub">
          <button className="settings-logout-btn" onClick={() => void onLogout()} type="button">
            <LogOut size={18} />
            Logga ut från Familjeappen
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}
