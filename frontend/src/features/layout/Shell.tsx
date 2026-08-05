import { lazy, Suspense, useEffect } from "react";
import { HeroBar } from "./HeroBar";
import { ThemePicker } from "../../components/ThemePicker";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { useShellState } from "../../hooks/useShellState";
import { RewardShopContext } from "../rewards/RewardShopContext";
import type { Membership } from "@shared/types";

export type ShellProps = {
  activeMembership: Membership;
  memberships: Membership[];
  onLogout: () => Promise<void>;
  onSwitchAccount: () => void;
  onSelectMembership: (m: Membership) => void;
  onMembershipsUpdated: (ms: Membership[]) => void;
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
// SettingsContent (2026-08-05, bundle-analys efter Lighthouse-rapporten) —
// var tidigare det ENDA av PanelRouters fyra grenar som importerades
// statiskt, trots att Shell.tsx alltid renderas oavsett vilken panel man
// faktiskt tittar på. Eftersom SettingsContent i sin tur statiskt importerar
// flera tunga underpaneler (TodoImportExport/TodoCreatorModal/TodoEditModal/
// RecurringTodosSettings/TemplatesSettings/RewardShopSettings m.fl., ~200KB
// okomprimerat) drogs hela den kedjan in i huvud-bundeln som måste laddas
// för att appen överhuvudtaget ska starta — även för en session som aldrig
// öppnar Inställningar. Samma lazy-mönster som de tre andra grenarna ovan.
const SettingsContent = lazy(() =>
  import("./SettingsContent").then((m) => ({ default: m.SettingsContent }))
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

export function Shell({
  activeMembership,
  memberships,
  onLogout,
  onSwitchAccount,
  onSelectMembership,
  onMembershipsUpdated,
}: ShellProps) {
  const {
    activeAccount,
    currentMember,
    activePanel,
    setActivePanel,
    settingsNavResetKey,
    themePickerMember,
    handleThemeSelect,
    handleDarkModeToggle,
    handleTextSizeSelect,
    closeThemePicker,
    apiError,
    childContentProps,
    memberContentProps,
    settingsProps,
    shopSettings,
    fontId,
    setFontId,
  } = useShellState(activeMembership, onLogout, memberships, onSelectMembership, onMembershipsUpdated);

  // Medlemsvyn (2026-07-30) — om en roll får canSeeMembers avstängd EFTER
  // att activePanel/lastActivePanel redan pekade på "members" (t.ex. en
  // admin ändrar rollen medan personen är kvar på panelen, eller en
  // persisterad lastActivePanel från innan ändringen), måste vyn hoppa
  // bort DIREKT — HeroBar.tsx:s nav-ikon döljs redan, men det räcker inte
  // ensamt (activePanel kan nås utan att klicka ikonen). En enda korrigering
  // här, istället för att varje konsument av activePanel (PanelRouter,
  // visibleThemeMember nedan) behöver sin egen dubblerade kontroll.
  useEffect(() => {
    if (activePanel === "members" && !settingsProps.canSeeMembers) {
      setActivePanel("home");
    }
  }, [activePanel, settingsProps.canSeeMembers, setActivePanel]);

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
  // Mörkt läge (2026-07-23) — bara vuxenteman, se ThemePicker.tsx.
  const shellDarkMode = !visibleThemeMember.isChild && (visibleThemeMember.darkMode ?? false);

  // Textstorlek (2026-07-25, Zaidas önskemål om bättre tillgänglighet för
  // äldre) — hela appens CSS är rem-baserad, och rem är alltid relativt
  // <html>s EGEN font-size, oavsett hur djupt nästlat ett element är. Ett
  // klass-/CSS-variabel-baserat sätt (som Mörkt läge använder för
  // färger) fungerar därför INTE för font-size — måste sättas direkt på
  // document.documentElement. Följer samma visibleThemeMember som
  // tema/mörkt läge (en vuxen som tittar på ett barns dashboard ser barnets
  // val, konsekvent med resten av personaliseringen).
  const textSizeScale: Record<string, string> = { normal: "100%", large: "115%", "extra-large": "130%" };
  useEffect(() => {
    document.documentElement.style.fontSize = textSizeScale[visibleThemeMember.textSize ?? "normal"];
  }, [visibleThemeMember.textSize]);

  return (
    <main className={`app-shell theme-${shellTheme}${shellDarkMode ? " dark-mode" : ""}`}>
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
        canSeeMembers={settingsProps.canSeeMembers}
        onNavigate={setActivePanel}
        onSwitchAccount={onSwitchAccount}
        onOpenThemePicker={() => memberContentProps.onThemePickerOpen(currentMember.id)}
        onSelectMemberProfile={(id) => {
          memberContentProps.onSelectMember(id);
          setActivePanel("home");
        }}
      />

      <div className={`app-shell-content${currentMember.isChild ? " app-shell-full" : ""}`}>
        {/* key={activePanel}-settingsNavResetKey — en krasch i en panel ska inte permanent
            låsa hela appen; navigerar man till en annan panel får felgränsen en ny chans
            (ommonteras). settingsNavResetKey (2026-07-26) tvingar SAMMA ommontering även när
            man klickar Inställningar-ikonen medan man redan står i Inställningar (activePanel
            byter då inte värde och skulle annars inte trigga en remount) — Zaidas önskemål om
            att alltid komma tillbaka till inställningsmenyns kategori-rutnät vid klick. */}
        <ErrorBoundary key={`${activePanel}-${settingsNavResetKey}`}>
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
            onToggleDarkMode={(darkMode) => handleDarkModeToggle(themePickerMember.id, darkMode)}
            onSelectTextSize={(textSize) => handleTextSizeSelect(themePickerMember.id, textSize)}
            fontId={fontId}
            onSelectFont={setFontId}
          />
        )}
      </div>
    </main>
  );
}
