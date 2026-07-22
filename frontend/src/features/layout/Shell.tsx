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
  // Medlemmar-panelen visar listan bara när INGEN är vald (2026-07-23,
  // Zaidas beslut) — så fort en medlem väljs (MembersView.tsx:s kort)
  // renderas MemberShellContent istället, med activePanel fortsatt
  // "members" (håller Medlemmar-ikonen markerad, se HeroBar.tsx). Samma
  // MemberShellContent som redan hanterar barn-/själv-/annan-vuxen-dashboard
  // internt utifrån selectedDashboardMemberId, bara nådd via en annan panel
  // nu än tidigare (var alltid "home").
  if (activePanel === "members" && !memberContentProps.selectedDashboardMemberId) {
    return (
      <MembersView
        account={activeAccount}
        currentMember={currentMember}
        members={settingsProps.members}
        roles={settingsProps.roles}
        onSelectMember={memberContentProps.onSelectMember}
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

  // 2026-07-23 (Zaidas beslut): ett medlemsval visas numera bara på
  // Medlemmar-panelen, inte Hem (se useAppState.ts:s setActivePanel) — den
  // här kontrollen följer samma villkor, annars skulle app-skalets tema
  // aldrig längre spegla den vy man faktiskt tittar på. Läser den LIVA
  // selectedDashboardMemberId (memberContentProps) istället för den
  // persisterade lastSelectedDashboardMemberId, av samma anledning.
  const selectedDashboardMember =
    settingsProps.members.find(
      (m) => m.id === memberContentProps.selectedDashboardMemberId && m.deletedAt === null
    ) ?? currentMember;

  const visibleThemeMember =
    activePanel === "members" ? selectedDashboardMember : currentMember;

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
