import { lazy, Suspense, type ReactNode } from "react";
import { HeroBar } from "./HeroBar";
import { AccountSetup } from "../accounts/AccountSetup";
import { SettingsSection } from "./SettingsSection";
import { ThemePicker } from "../../components/ThemePicker";
import { useAppFont } from "../../components/FontPicker";
import { LogOut } from "lucide-react";
import { useShellState } from "../../hooks/useShellState";
import type { Membership } from "@shared/types";

export type ShellProps = { activeMembership: Membership; onLogout: () => Promise<void>; onSwitchAccount: () => void };

const AccountSettings = lazy(() =>
  import("../accounts/AccountSettings").then((module) => ({ default: module.AccountSettings }))
);
const CalendarPanel = lazy(() =>
  import("../calendars/CalendarPanel").then((module) => ({ default: module.CalendarPanel }))
);
const ChildSettings = lazy(() =>
  import("../children/ChildSettings").then((module) => ({ default: module.ChildSettings }))
);
const ChildShellContent = lazy(() =>
  import("../children/ChildShellContent").then((module) => ({ default: module.ChildShellContent }))
);
const DeleteAccountSection = lazy(() =>
  import("../accounts/DeleteAccountSection").then((module) => ({ default: module.DeleteAccountSection }))
);
const InviteForm = lazy(() =>
  import("../invitations/InviteForm").then((module) => ({ default: module.InviteForm }))
);
const MemberShellContent = lazy(() =>
  import("../adults/MemberShellContent").then((module) => ({ default: module.MemberShellContent }))
);
const MembersView = lazy(() =>
  import("../members/MembersView").then((module) => ({ default: module.MembersView }))
);
const RoleEditor = lazy(() =>
  import("../roles/RoleEditor").then((module) => ({ default: module.RoleEditor }))
);
const ShoppingListsPanel = lazy(() =>
  import("../shopping/ShoppingListsPanel").then((module) => ({ default: module.ShoppingListsPanel }))
);
const TrashView = lazy(() =>
  import("../trash/TrashView").then((module) => ({ default: module.TrashView }))
);

export function Shell({ activeMembership, onLogout, onSwitchAccount }: ShellProps) {
  const { fontId, setFontId } = useAppFont();
  const {
    activeAccount, currentMember, activePanel, setActivePanel,
    themePickerMember, handleThemeSelect, closeThemePicker, apiError,
    childContentProps, memberContentProps, settingsProps
  } = useShellState(activeMembership, onLogout);

  const { canManageMembers, canManageRoles, canViewTrash } = settingsProps;

  let panelContent: ReactNode;

  if (currentMember.isChild) {
    panelContent = <ChildShellContent {...childContentProps} />;
  } else if (activePanel === "members") {
    panelContent = (
      <MembersView
        account={activeAccount}
        currentMember={currentMember}
        members={settingsProps.members}
        roles={settingsProps.roles}
        onSelectMember={memberContentProps.onSelectMember}
        onNavigate={setActivePanel}
      />
    );
  } else if (activePanel === "settings") {
    panelContent = (
      <div className="settings-accordion">
        <SettingsSection title="Konto" defaultOpen>
          <AccountSetup account={activeAccount} onUpdateAccount={settingsProps.onUpdateAccount} />
        </SettingsSection>
        <SettingsSection title="Familjemedlemmar">
          <AccountSettings
            account={activeAccount}
            currentMember={currentMember}
            members={settingsProps.members}
            roles={settingsProps.roles}
            calendars={settingsProps.calendars}
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
              <InviteForm accountId={activeAccount.id} roles={settingsProps.roles} />
            </div>
          )}
        </SettingsSection>
        <SettingsSection title="Barn">
          <ChildSettings
            currentMember={currentMember}
            members={settingsProps.members}
            roles={settingsProps.roles}
            todos={settingsProps.todos}
            rewards={settingsProps.rewards}
            wishStars={settingsProps.wishStars}
            onCreateWish={settingsProps.onCreateWish}
            onSetWishStars={settingsProps.onSetWishStars}
            onApproveTodo={settingsProps.onApproveTodo}
            onRejectTodo={settingsProps.onRejectTodo}
            onApproveWish={settingsProps.onApproveWish}
            onRejectWish={settingsProps.onRejectWish}
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
            calendars={settingsProps.calendars}
            currentMember={currentMember}
            members={settingsProps.members}
            roles={settingsProps.roles}
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
          />
        </SettingsSection>
        <SettingsSection title="Inköpslistor">
          <ShoppingListsPanel
            managementOnly
            currentMember={currentMember}
            members={settingsProps.members}
            roles={settingsProps.roles}
            shoppingLists={settingsProps.shoppingLists}
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
              members={settingsProps.members}
              roles={settingsProps.roles}
              onAssignRole={settingsProps.onAssignRole}
              onCreateRole={settingsProps.onCreateRole}
              onTogglePermission={settingsProps.onTogglePermission}
            />
          </SettingsSection>
        )}
        {canViewTrash && (
          <SettingsSection title="Papperskorg">
            <TrashView
              calendars={settingsProps.calendars}
              currentMember={currentMember}
              members={settingsProps.members}
              roles={settingsProps.roles}
              shoppingLists={settingsProps.shoppingLists}
              todos={settingsProps.todos}
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
            <button
              className="settings-logout-btn"
              onClick={() => void onLogout()}
              type="button"
            >
              <LogOut size={18} />
              Logga ut från Familjeappen
            </button>
          </div>
        </SettingsSection>
      </div>
    );
  } else {
    panelContent = (
      <MemberShellContent
        {...memberContentProps}
        activePanel={activePanel}
        accountName={activeAccount.name}
        calendarSettings={activeAccount.calendarSettings}
        onNavigate={setActivePanel}
      />
    );
  }

  const isChild = currentMember.isChild;
  const shellTheme = currentMember.dashboardTheme ?? (isChild ? "space" : "clear");

  return (
    <main className={`app-shell theme-${shellTheme}`}>
      {apiError && <div className="api-error-banner" role="alert">{apiError}</div>}
      {!isChild && (
        <HeroBar
          activePanel={activePanel}
          accountName={activeAccount.name}
          currentMember={currentMember}
          canManageMembers={canManageMembers}
          onNavigate={setActivePanel}
          onSwitchAccount={onSwitchAccount}
          onOpenThemePicker={() => memberContentProps.onThemePickerOpen(currentMember.id)}
        />
      )}
      <div className={`app-shell-content${isChild ? " app-shell-full" : ""}`}>
        <Suspense fallback={<p className="empty-note">Laddar...</p>}>
          {panelContent}
        </Suspense>
        {themePickerMember && (
          <ThemePicker
            member={themePickerMember}
            onClose={closeThemePicker}
            onSelectTheme={(themeId) => handleThemeSelect(themePickerMember.id, themeId)}
            fontId={fontId}
            onSelectFont={setFontId}
          />
        )}
      </div>
    </main>
  );
}
