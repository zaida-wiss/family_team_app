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
import { ThemePicker } from "./components/ThemePicker";
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
      <>
        <AccountSettings
          account={activeAccount}
          currentMember={currentMember}
          members={settingsProps.members}
          roles={settingsProps.roles}
          onCreateMember={settingsProps.onCreateMember}
          onDeleteMember={settingsProps.onDeleteMember}
          onDeleteOwnData={settingsProps.onDeleteOwnData}
          onUpdateMemberAvatar={settingsProps.onUpdateMemberAvatar}
        />
        {canManageMembers && (
          <InviteForm accountId={activeAccount.id} roles={settingsProps.roles} />
        )}
      </>
    );
  } else if (activePanel === "roles") {
    panelContent = (
      <RoleEditor
        members={settingsProps.members}
        roles={settingsProps.roles}
        onAssignRole={settingsProps.onAssignRole}
        onCreateRole={settingsProps.onCreateRole}
        onTogglePermission={settingsProps.onTogglePermission}
      />
    );
  } else if (activePanel === "trash") {
    panelContent = (
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
    );
  } else if (activePanel === "settings") {
    panelContent = (
      <>
        <AccountSetup account={activeAccount} onUpdateAccount={settingsProps.onUpdateAccount} />
        <DeleteAccountSection
          accountId={activeAccount.id}
          accountName={activeAccount.name}
          onConfirm={settingsProps.onDeleteAccount}
        />
      </>
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

  return (
    <main className={`app-shell${currentMember.isChild ? ` theme-${currentMember.dashboardTheme ?? "space"}` : ""}`}>
      {apiError && <div className="api-error-banner" role="alert">{apiError}</div>}
      {!currentMember.isChild && (
        <HeroBar
          activePanel={activePanel}
          canManageMembers={canManageMembers}
          canManageRoles={canManageRoles}
          canViewTrash={canViewTrash}
          onNavigate={setActivePanel}
          onSwitchAccount={onSwitchAccount}
        />
      )}
      {panelContent}
      {themePickerMember && (
        <ThemePicker
          member={themePickerMember}
          onClose={closeThemePicker}
          onSelectTheme={(themeId) => handleThemeSelect(themePickerMember.id, themeId)}
        />
      )}
    </main>
  );
}
