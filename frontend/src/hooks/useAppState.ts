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
    updateMemberTheme,
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

  function setActivePanel(panel: ShellPanel) {
    setActivePanelRaw(panel);
    updateMemberNavigation(initialMembership.member.id, { lastActivePanel: panel });
    // Kalender-panelen (2026-07-21/22) respekterar vald familjemedlem
    // (focusMemberId, se MemberShellContent.tsx/useCalendarView.ts) precis
    // som Hem-vyn redan gjorde — och (2026-07-22, Zaidas önskemål: "även
    // vuxna skall kunna se samma barnvy som om de vore ett barn") Todos/
    // Inköp visar nu likaså barnets dashboard istället för den vuxna
    // panelvyn när ett barn är valt. Valet får därför INTE nollställas när
    // man navigerar till NÅGON av de fyra innehållspanelerna — bara
    // Medlemmar/Inställningar (kontoadministration, inte per-medlem-vyer)
    // nollställer fortfarande. Detta var den faktiska grundorsaken till att
    // "kalendern visade fel persons kalender" (2026-07-21/22): valet
    // försvann redan HÄR, innan panelen ens hann rendera.
    const contentPanels: ShellPanel[] = ["home", "calendar", "shopping", "todos"];
    if (!contentPanels.includes(panel)) setSelectedDashboardMemberIdRaw(null);
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
    updateMemberTheme,
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
    apiError
  };
}
