import { lazy, Suspense } from "react";
import { HeroBar } from "./HeroBar";
import { SettingsContent } from "./SettingsContent";
import { ThemePicker } from "../../components/ThemePicker";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { useShellState } from "../../hooks/useShellState";
import { RewardShopContext } from "../rewards/RewardShopContext";
import type { Membership } from "@shared/types";

export type ShellProps = {
  activeMembership: Membership;
  onLogout: () => Promise<void>;
  onSwitchAccount: () => void;
};

const ChildShellContent = lazy(() =>
  import("../children/ChildShellContent").then((m) => ({ default: m.ChildShellContent }))
);
const MemberShellContent = lazy(() =>
  import("../adults/MemberShellContent").then((m) => ({ default: m.MemberShellContent }))
);
const MembersView = lazy(() =>
  import("../members/MembersView").then((m) => ({ default: m.MembersView }))
);

type ShellState = ReturnType<typeof useShellState>;

type PanelRouterProps = {
  currentMember: ShellState["currentMember"];
  activePanel: ShellState["activePanel"];
  activeAccount: ShellState["activeAccount"];
  settingsProps: ShellState["settingsProps"];
  memberContentProps: ShellState["memberContentProps"];
  childContentProps: ShellState["childContentProps"];
  setActivePanel: ShellState["setActivePanel"];
  onLogout: () => Promise<void>;
};

function PanelRouter({
  currentMember,
  activePanel,
  activeAccount,
  settingsProps,
  memberContentProps,
  childContentProps,
  setActivePanel,
  onLogout,
}: PanelRouterProps) {
  if (currentMember.isChild) {
    return <ChildShellContent {...childContentProps} />;
  }
  if (activePanel === "members") {
    return (
      <MembersView
        account={activeAccount}
        currentMember={currentMember}
        members={settingsProps.members}
        roles={settingsProps.roles}
        onSelectMember={memberContentProps.onSelectMember}
        onNavigate={setActivePanel}
      />
    );
  }
  if (activePanel === "settings") {
    return (
      <SettingsContent
        settingsProps={settingsProps}
        memberContentProps={memberContentProps}
        onLogout={onLogout}
      />
    );
  }
  return (
    <MemberShellContent
      {...memberContentProps}
      activePanel={activePanel}
      accountName={activeAccount.name}
      calendarSettings={activeAccount.calendarSettings}
      onNavigate={setActivePanel}
    />
  );
}

export function Shell({ activeMembership, onLogout, onSwitchAccount }: ShellProps) {
  const {
    activeAccount,
    currentMember,
    activePanel,
    setActivePanel,
    themePickerMember,
    handleThemeSelect,
    closeThemePicker,
    apiError,
    childContentProps,
    memberContentProps,
    settingsProps,
    shopSettings,
    fontId,
    setFontId,
  } = useShellState(activeMembership, onLogout);

  const selectedDashboardMember =
    settingsProps.members.find(
      (m) => m.id === currentMember.lastSelectedDashboardMemberId && m.deletedAt === null
    ) ?? currentMember;

  const visibleThemeMember =
    activePanel === "home" ? selectedDashboardMember : currentMember;

  const shellTheme =
    visibleThemeMember.dashboardTheme ?? (visibleThemeMember.isChild ? "space" : "clear");

  return (
    <main className={`app-shell theme-${shellTheme}`}>
      {apiError && (
        <div className="api-error-banner" role="alert">
          {apiError}
        </div>
      )}

      <HeroBar
        activePanel={activePanel}
        accountName={activeAccount.name}
        currentMember={currentMember}
        activeMembers={memberContentProps.activeMembers}
        canManageMembers={settingsProps.canManageMembers}
        onNavigate={setActivePanel}
        onSwitchAccount={onSwitchAccount}
        onOpenThemePicker={() => memberContentProps.onThemePickerOpen(currentMember.id)}
        onSelectMemberProfile={(id) => {
          memberContentProps.onSelectMember(id);
          setActivePanel("home");
        }}
      />

      <div className={`app-shell-content${currentMember.isChild ? " app-shell-full" : ""}`}>
        {/* key={activePanel} — en krasch i en panel ska inte permanent låsa hela appen;
            navigerar man till en annan panel får felgränsen en ny chans (ommonteras). */}
        <ErrorBoundary key={activePanel}>
          <Suspense fallback={<p className="empty-note">Laddar...</p>}>
            <RewardShopContext.Provider value={shopSettings}>
              <PanelRouter
                currentMember={currentMember}
                activePanel={activePanel}
                activeAccount={activeAccount}
                settingsProps={settingsProps}
                memberContentProps={memberContentProps}
                childContentProps={childContentProps}
                setActivePanel={setActivePanel}
                onLogout={onLogout}
              />
            </RewardShopContext.Provider>
          </Suspense>
        </ErrorBoundary>

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
