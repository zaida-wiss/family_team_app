import { lazy, Suspense, useEffect } from "react";
import { HeroBar } from "./HeroBar";
import { ThemePicker } from "../../components/ThemePicker";
import { RecordCelebration } from "../../components/RecordCelebration";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { useShellState } from "../../hooks/useShellState";
import { primeTimerAudio } from "../../utils/timerSound";
import { RewardShopContext } from "../rewards/RewardShopContext";
import type { Membership, User } from "@shared/types";

export type ShellProps = {
  activeMembership: Membership;
  memberships: Membership[];
  user: User;
  onLogout: () => Promise<void>;
  onSwitchAccount: () => void;
  onSelectMembership: (m: Membership) => void;
  onMembershipsUpdated: (ms: Membership[]) => void;
  onUpdateMyAvatar: (avatarUrl: string | null) => Promise<void>;
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
  onSwitchAccount: () => void;
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
  onSwitchAccount,
}: PanelRouterProps) {
  if (currentMember.isChild) {
    return <ChildShellContent {...childContentProps} />;
  }
  // Medlemmar-panelen visar listan bara när INGEN är vald (2026-07-23,
  // Zaidas beslut) — så fort en medlem väljs (MembersView.tsx:s kort)
  // renderas MemberShellContent istället, med activePanel fortsatt
  // "members". Samma MemberShellContent som redan hanterar
  // barn-/själv-/annan-vuxen-dashboard internt utifrån
  // selectedDashboardMemberId, bara nådd via en annan panel nu än tidigare
  // (var alltid "home"). HeroBar.tsx:s egen Medlemmar-nav-ikon togs bort
  // 2026-08-09 (Zaidas beslut) — Hem-vyns "Visa medlemmar"-popup
  // (MemberOverview.tsx) är nu enda vägen in, och sätter activePanel till
  // "members" OCH en vald medlem i samma klick (se MemberShellContent.tsx:s
  // handleSelectMemberFromHome). Grenen nedan (listan UTAN vald medlem)
  // finns numera kvar bara som ett säkerhetsnät mot gammal persisterad
  // lastActivePanel:"members"-data — ingen kvarvarande UI leder hit direkt.
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
        onSwitchAccount={onSwitchAccount}
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
  user,
  onLogout,
  onSwitchAccount,
  onSelectMembership,
  onMembershipsUpdated,
  onUpdateMyAvatar,
}: ShellProps) {
  const {
    activeAccount,
    currentMember,
    activePanel,
    setActivePanel,
    homeShowFamilyNav,
    setHomeShowFamilyNav,
    panelNavResetKey,
    themePickerMember,
    handleThemeSelect,
    handleDarkModeToggle,
    handleTextSizeSelect,
    textSizeDeviceOverride,
    handleToggleDeviceTextSize,
    closeThemePicker,
    apiError,
    childContentProps,
    memberContentProps,
    settingsProps,
    shopSettings,
    fontId,
    setFontId,
    recordCelebration,
    dismissRecordCelebration,
  } = useShellState(activeMembership, onLogout, memberships, onSelectMembership, onMembershipsUpdated, user, onUpdateMyAvatar);

  // Låser upp ljuduppspelning (nedräkningens "klar"-signal, timerSound.ts,
  // 2026-08-10) redan vid FÖRSTA riktiga tryck/klick i appen — mobila
  // webbläsares autoplay-policy kräver att AudioContext skapas/återupptas
  // inom en genuin användargest innan den kan spela ljud senare, utan en ny
  // gest, när en nedräkning tickar ner till 0 av sig själv. En engångs-
  // lyssnare på hela dokumentet (inte bara timer-widgetarna) täcker även
  // fallet att timern startats via en gest någon annanstans (t.ex. tre-
  // tryck-gesten på en bubbla i tråd-vyn).
  useEffect(() => {
    let unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      primeTimerAudio();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    }
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

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

  // Fast/kant-till-kant skal (2026-08-09, Zaidas fynd: "jag vill inte kunna
  // skrolla bort bakgrunden så att det blir vitt... Den hoppat[e] upp och
  // ner") — .app-shell-content.app-shell-full (overflow:hidden +
  // overscroll-behavior:none, se layout.css) applicerades tidigare BARA när
  // currentMember.isChild (ett riktigt inloggat barns EGEN vy). En vuxen
  // som tittar på en vald medlems dashboard (samma ChildDashboard/
  // PersonalDashboard-rotträd, samma .child-dashboard-klass) renderas dock
  // inuti en VANLIG .app-shell-content — som på mobil har overflow-y:auto
  // och ingen overscroll-behavior-spärr alls, vilket lät en elastisk
  // bakgrundsstuds (iOS-panorering förbi kantens overflow) blotta
  // webbläsarens tomma, ostylade vita duk bakom. Samma lås tillämpas nu
  // även här — kräver en verkligt UPPLÖST medlem (inte bara ett satt id;
  // matchar exakt samma villkor som MemberShellContent.tsx:s egen
  // render-spärr för ChildDashboard/PersonalDashboard/ChildRecordsPage,
  // annars hade en gammal/raderad medlems-id av misstag låst skalet trots
  // att den panelen faller tillbaka på en helt annan vy).
  const isViewingMemberDashboard =
    activePanel === "members" &&
    settingsProps.members.some(
      (m) => m.id === memberContentProps.selectedDashboardMemberId && m.deletedAt === null
    );

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
  // val, konsekvent med resten av personaliseringen) — OM inte den här
  // enheten har en egen override (textSizeDeviceOverride), som då alltid
  // vinner oavsett vems dashboard som visas (2026-08-10, Zaidas önskemål om
  // en enhetsspecifik textstorlek, t.ex. en delad familjeplatta).
  //
  // Skalning mot skärmstorlek (2026-08-10, Zaidas önskemål: "innehållet
  // [ska bli] större när skärmen blir både bredare och större... navbars,
  // inställningar, textstorlek") — clamp()-uttrycket nedan är en ren CSS-
  // längd som webbläsaren räknar om automatiskt vid fönsterändring, ingen
  // JS-resize-lyssnare behövs. Multipliceras med användarens valda skala
  // (normal/stor/extra stor) via calc() — en <length> går att multiplicera
  // med ett tal i CSS. Eftersom nästan all layout i appen redan är rem-
  // baserad (bl.a. .icon-button, todo-bubblornas --ball-size) väger denna
  // ENDA ändring igenom text, knappar, avstånd och bubblor på samma gång.
  const textSizeScale: Record<string, number> = { normal: 1, large: 1.15, "extra-large": 1.3 };
  const effectiveTextSize = textSizeDeviceOverride ?? visibleThemeMember.textSize ?? "normal";
  useEffect(() => {
    const scale = textSizeScale[effectiveTextSize] ?? 1;
    document.documentElement.style.fontSize = `calc(clamp(15px, 13px + 0.6vw, 22px) * ${scale})`;
  }, [effectiveTextSize]);

  // Två navbarer, en i taget (2026-08-12, Zaidas beslut: "Växla mellan de
  // två navbarerna, personlig och familjer... visa bara en navbar åt
  // gången") — HeroBar ("personlig") och Hem-vyns egen familjenavbar
  // (MemberOverview.tsx:s controlRow, "familjer") delar samma fysiska plats
  // längst ner istället för att staplas ovanpå varandra. HeroBars Hem-knapp
  // (huset) ska alltid ta en tillbaka till familjenavbaren — även om man
  // redan står på Hem-panelen med HeroBar synlig (familjenavbarens nya
  // person-ikon satte då homeShowFamilyNav till false) — därför en egen
  // wrapper istället för att skicka setActivePanel direkt: en vanlig
  // useEffect på activePanel hade missat just det fallet (samma
  // panel-värde både före och efter, ingen förändring att reagera på).
  function navigateFromHeroBar(panel: ShellState["activePanel"]) {
    if (panel === "home") setHomeShowFamilyNav(true);
    setActivePanel(panel);
  }
  // isChild-vyn (ChildShellContent) berörs inte av växlingen ovan — den har
  // sin egen, redan etablerade kant-till-kant-hantering (se app-shell-full
  // nedan) och render:ar aldrig MemberOverview.tsx:s familjenavbar
  // överhuvudtaget. Utan detta villkor hade en isChild-medlem med
  // activePanel==="home" (t.ex. kvarvarande persisterad state) kunnat tappa
  // HeroBar helt utan att familjenavbaren tar över — den existerar bara i
  // den vuxna Hem-vyn.
  //
  // CSS-döljning (display:none via HeroBar.module.css), INTE avmontering
  // (villkorlig {hideHeroBar && <HeroBar/>}) — bar-växlingen är bara
  // relevant på mobil, där de två navbarerna konkurrerar om samma fysiska
  // bottenplats. På desktop (≥1024px) är HeroBar en sidopanel utan någon
  // platskonflikt alls (Hem-vyns egen controlRow ligger sticky överst i
  // INNEHÅLLET, en helt annan yta) — en avmonterad HeroBar hade strandat en
  // desktop-användare helt utan sidonav så fort de öppnade Hem.
  const hideHeroBarOnMobile = !currentMember.isChild && activePanel === "home" && homeShowFamilyNav;

  return (
    <main className={`app-shell theme-${shellTheme}${shellDarkMode ? " dark-mode" : ""}`}>
      {apiError && (
        <div className="api-error-banner" role="alert">
          {apiError}
        </div>
      )}

      <HeroBar
        activePanel={activePanel}
        hiddenOnMobile={hideHeroBarOnMobile}
        onNavigate={navigateFromHeroBar}
      />

      <div
        className={`app-shell-content${
          currentMember.isChild
            ? " app-shell-full"
            // 2026-08-10 (Zaida: "jag tappar navbarerna och blir fast på
            // childrensview vid vissa skärmbredder") — currentMember.isChild
            // (ett riktigt inloggat barns EGEN vy) behåller det avsiktliga
            // helt-kant-till-kant-läget (sidonav dolt, barnet har ingen
            // annan panel att navigera till ändå). isViewingMemberDashboard
            // (en VUXEN som tittar på en vald medlems dashboard via "Visa
            // medlemmar") fick tidigare EXAKT samma behandling — men en
            // vuxen behöver kunna ta sig därifrån, och varken ChildDashboard.
            // tsx eller PersonalDashboard.tsx har någon egen tillbaka-knapp.
            // app-shell-full--inline behåller samma kant-till-kant-styling
            // för INNEHÅLLET (ingen padding, fast höjd, ingen studs) men
            // låter sidonaven vara kvar synlig/klickbar på ≥1024px (se
            // layout.css) — under 1024px är HeroBar redan alltid
            // position:fixed och opåverkad oavsett.
            : isViewingMemberDashboard
            ? " app-shell-full app-shell-full--inline"
            : ""
        }`}
      >
        {/* key={activePanel}-panelNavResetKey — en krasch i en panel ska inte permanent
            låsa hela appen; navigerar man till en annan panel får felgränsen en ny chans
            (ommonteras). panelNavResetKey (2026-07-26, generaliserad 2026-08-09 till alla
            nav-ikoner) tvingar SAMMA ommontering även när man klickar en ikon för en panel
            man redan står i (activePanel byter då inte värde och skulle annars inte trigga
            en remount) — Zaidas önskemål om att alltid komma tillbaka till panelens
            grundvy och stänga eventuella öppna modaler vid ett sådant klick. */}
        <ErrorBoundary key={`${activePanel}-${panelNavResetKey}`}>
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
                onSwitchAccount={onSwitchAccount}
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
            textSize={textSizeDeviceOverride ?? themePickerMember.textSize ?? "normal"}
            deviceTextSizeOverride={textSizeDeviceOverride !== null}
            onToggleDeviceTextSize={handleToggleDeviceTextSize}
            fontId={fontId}
            onSelectFont={setFontId}
          />
        )}

        {recordCelebration && (
          <RecordCelebration
            title={recordCelebration.title}
            elapsedMs={recordCelebration.elapsedMs}
            onDismiss={dismissRecordCelebration}
          />
        )}
      </div>
    </main>
  );
}
