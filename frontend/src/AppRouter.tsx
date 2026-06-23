import { AuthPage } from "./features/auth/AuthPage";
import { AccountPicker } from "./features/auth/AccountPicker";
import { AcceptInvitePage } from "./features/invitations/AcceptInvitePage";
import { ChildShellContent } from "./features/children/ChildShellContent";
import { MemberShellContent } from "./features/adults/MemberShellContent";
import { HeroBar } from "./features/layout/HeroBar";
import { AccountSettings } from "./features/accounts/AccountSettings";
import { AccountSetup } from "./features/accounts/AccountSetup";
import { DeleteAccountSection } from "./features/accounts/DeleteAccountSection";
import { InviteForm } from "./features/invitations/InviteForm";
import { RoleEditor } from "./features/roles/RoleEditor";
import { TrashView } from "./features/trash/TrashView";
import { CalendarPanel } from "./features/calendars/CalendarPanel";
import { ShoppingListsPanel } from "./features/shopping/ShoppingListsPanel";
import { MembersView } from "./features/members/MembersView";
import { SettingsSection } from "./features/layout/SettingsSection";
import { ThemePicker } from "./components/ThemePicker";
import { LogOut } from "lucide-react";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useShellState } from "./hooks/useShellState";
import type { Membership } from "@shared/types";

export function AppRouter() {
  const nav = useAppNavigation();

  if (nav.screen === "loading") {
    return <main className="app-shell"><p style={{ padding: "2rem" }}>Laddar…</p></main>;
  }
  if (nav.screen === "invite") {
    return <AcceptInvitePage token={nav.token} onAccepted={nav.onAccepted} />;
  }
  if (nav.screen === "auth") {
    return <AuthPage onLogin={nav.onLogin} onRegister={nav.onRegister} />;
  }
  if (nav.screen === "picker") {
    return (
      <AccountPicker
        user={nav.user}
        memberships={nav.memberships}
        onSelect={nav.onSelect}
        onLogout={nav.onLogout}
        onMembershipsUpdated={nav.onMembershipsUpdated}
      />
    );
  }
  return (
    <Shell
      activeMembership={nav.activeMembership}
      onLogout={nav.onLogout}
      onSwitchAccount={nav.onSwitchAccount}
    />
  );
}

type ShellProps = { activeMembership: Membership; onLogout: () => Promise<void>; onSwitchAccount: () => void };

function Shell({ activeMembership, onLogout, onSwitchAccount }: ShellProps) {
  const {
    activeAccount, currentMember, activePanel, setActivePanel,
    themePickerMember, handleThemeSelect, closeThemePicker, apiError,
    childContentProps, memberContentProps, settingsProps
  } = useShellState(activeMembership, onLogout);

  const { canManageMembers, canManageRoles, canViewTrash } = settingsProps;

  let panelContent: React.ReactNode;

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
            onCreateMember={settingsProps.onCreateMember}
            onDeleteMember={settingsProps.onDeleteMember}
            onDeleteOwnData={settingsProps.onDeleteOwnData}
            onUpdateMemberAvatar={settingsProps.onUpdateMemberAvatar}
            onUpdateMemberColor={settingsProps.onUpdateMemberColor}
          />
          {canManageMembers && (
            <InviteForm accountId={activeAccount.id} roles={settingsProps.roles} />
          )}
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
          <DeleteAccountSection
            accountId={activeAccount.id}
            accountName={activeAccount.name}
            onConfirm={settingsProps.onDeleteAccount}
          />
        </SettingsSection>
        <SettingsSection title="Logga ut">
          <button
            className="settings-logout-btn"
            onClick={() => void onLogout()}
            type="button"
          >
            <LogOut size={18} />
            Logga ut från Familjeappen
          </button>
        </SettingsSection>
      </div>
    );
  } else {
    panelContent = (
      <MemberShellContent
        {...memberContentProps}
        activePanel={activePanel}
        accountName={activeAccount.name}
        onNavigate={setActivePanel}
      />
    );
  }

  const isChild = currentMember.isChild;

  return (
    <main className={`app-shell${isChild ? ` theme-${currentMember.dashboardTheme ?? "space"}` : ""}`}>
      {apiError && <div className="api-error-banner" role="alert">{apiError}</div>}
      {!isChild && (
        <HeroBar
          activePanel={activePanel}
          accountName={activeAccount.name}
          currentMember={currentMember}
          canManageMembers={canManageMembers}
          onNavigate={setActivePanel}
          onSwitchAccount={onSwitchAccount}
        />
      )}
      <div className={`app-shell-content${isChild ? " app-shell-full" : ""}`}>
        {panelContent}
        {themePickerMember && (
          <ThemePicker
            member={themePickerMember}
            onClose={closeThemePicker}
            onSelectTheme={(themeId) => handleThemeSelect(themePickerMember.id, themeId)}
          />
        )}
      </div>
    </main>
  );
}
