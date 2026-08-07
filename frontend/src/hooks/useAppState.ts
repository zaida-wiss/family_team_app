import { useEffect, useMemo, useState } from "react";
import { setApiErrorHandler, setApiMemberId } from "../api";
import { useAccountState } from "../features/accounts/useAccountState";
import { useCalendarsState } from "../features/calendars/useCalendarsState";
import { useMembersState } from "../features/members/useMembersState";
import { useRewardsState } from "../features/rewards/useRewardsState";
import { useRolesState } from "../features/roles/useRolesState";
import { useShoppingState } from "../features/shopping/useShoppingState";
import { useTodosState } from "../features/todos/useTodosState";
import type { Account, AppPanel, Id, Member } from "@shared/types";

export type ShellPanel = AppPanel;

type ActiveMembership = { member: Member; account: Account };

export function useAppState(initialMembership: ActiveMembership) {
  const { activeAccount, setActiveAccount } = useAccountState(initialMembership.account);
  const { roles, createRole, toggleRolePermission } = useRolesState();
  const {
    members,
    createMember,
    softDeleteMember,
    restoreMember,
    purgeMembersTrash,
    updateMemberTheme,
    updateMemberDarkMode,
    updateMemberTextSize,
    updateMemberHiddenCrossAccountIds,
    updateMemberAvatar,
    updateMemberColor,
    updateMemberName,
    updateCalendarFilterSettings,
    updateChildTimelineSettings,
    updateMemberNavigation,
    assignRole,
    clearMemberAvatar,
    setChildCredentials
  } = useMembersState();
  const todosState = useTodosState(activeAccount.fixedTodoTimes ?? false);
  const calendarsState = useCalendarsState();
  const shoppingState = useShoppingState();
  const rewardsState = useRewardsState();

  // Återställs från persisterad state (2026-07-06-fix) — saknades tidigare,
  // så en sidomladdning medan man tittade på ett barns dashboard nollställde
  // valet och man hamnade på den inloggade medlemmens egen Hem-vy istället,
  // trots att activePanel korrekt återställdes till "home".
  const [selectedDashboardMemberId, setSelectedDashboardMemberIdRaw] = useState<Id | null>(
    initialMembership.member.lastSelectedDashboardMemberId ?? null
  );
  const [themePickerMemberId, setThemePickerMemberId] = useState<Id | null>(null);
  const [activePanel, setActivePanelRaw] = useState<ShellPanel>(
    initialMembership.member.lastActivePanel ?? "home"
  );
  const [apiError, setApiError] = useState<string | null>(null);
  // Ökas vid VARJE klick på en nav-ikon, oavsett om panelen faktiskt bytte
  // värde (2026-07-26, ursprungligen bara för Inställningar: "trycker jag på
  // inställningar-ikonen när jag är på en gren inne i inställningar så
  // skall jag komma tillbaka till inställningsmenyn" — generaliserad
  // 2026-08-09 till samtliga nav-ikoner på båda navbarerna: "om jag är inne
  // i en modal i todo och klickar på todo ikonen då vill jag komma tillbaka
  // till todo-vyn"). Ett klick på en redan aktiv panels egen ikon ändrar
  // aldrig `activePanel`, så ErrorBoundary key={activePanel} i Shell.tsx
  // remountar aldrig panelträdet av sig själv — den här räknaren är en
  // TILLÄGGSDEL av samma key (`${activePanel}-${panelNavResetKey}`) och
  // tvingar fram en remount ändå, vilket nollställer all lokal state i
  // panelen (öppna modaler, SettingsCategoryNavs interna val, m.m.) oavsett
  // om panelen faktiskt bytte värde.
  const [panelNavResetKey, setPanelNavResetKey] = useState(0);

  function setActivePanel(panel: ShellPanel) {
    setActivePanelRaw(panel);
    setPanelNavResetKey((k) => k + 1);
    setSelectedDashboardMemberIdRaw(null);
    updateMemberNavigation(initialMembership.member.id, {
      lastActivePanel: panel,
      // Ett explicit navigeringsklick (vilken nav-ikon som helst, inklusive
      // Medlemmar-ikonen igen) rensar alltid en vald medlem (2026-07-23,
      // Zaidas beslut: "endast medlemmar symbolen som skall vara markerad.
      // Klickar vi på hemmet eller kalendern så ska det inte längre vara
      // barnvyn") — ersätter 2026-07-21/22-beteendet där valet överlevde
      // Hem/Kalender/Todos/Inköp, vilket gjorde att "fel" nav-ikon visades
      // som aktiv medan en annan medlems vy syntes. Att VÄLJA en medlem
      // (MembersView.tsx:s korta) går via setSelectedDashboardMemberId
      // nedan, inte via denna funktion — så själva valet överlever alltså
      // fint kvar så länge man stannar på Medlemmar-panelen.
      lastSelectedDashboardMemberId: null
    });
  }

  function setSelectedDashboardMemberId(memberId: Id | null) {
    setSelectedDashboardMemberIdRaw(memberId);
    updateMemberNavigation(initialMembership.member.id, {
      lastSelectedDashboardMemberId: memberId
    });
  }

  const currentMember =
    members.find((member) => member.id === initialMembership.member.id) ??
    initialMembership.member;

  useEffect(() => {
    setApiMemberId(currentMember.id);
  }, [currentMember.id]);

  useEffect(() => {
    setApiErrorHandler((message) => {
      setApiError(message);
      window.setTimeout(() => setApiError(null), 4000);
    });
  }, []);

  const activeMembers = useMemo(
    () =>
      members
        .filter((m) => m.deletedAt === null)
        .sort((a, b) => Number(a.isChild) - Number(b.isChild)),
    [members]
  );

  return {
    activeAccount,
    setActiveAccount,
    roles,
    createRole,
    toggleRolePermission,
    members,
    createMember,
    softDeleteMember,
    restoreMember,
    purgeMembersTrash,
    updateMemberTheme,
    updateMemberDarkMode,
    updateMemberTextSize,
    updateMemberHiddenCrossAccountIds,
    updateMemberAvatar,
    updateMemberColor,
    updateMemberName,
    updateCalendarFilterSettings,
    updateChildTimelineSettings,
    updateMemberNavigation,
    assignRole,
    clearMemberAvatar,
    setChildCredentials,
    todosState,
    calendarsState,
    shoppingState,
    rewardsState,
    currentMember,
    activeMembers,
    selectedDashboardMemberId,
    setSelectedDashboardMemberId,
    themePickerMemberId,
    setThemePickerMemberId,
    activePanel,
    setActivePanel,
    panelNavResetKey,
    apiError
  };
}
