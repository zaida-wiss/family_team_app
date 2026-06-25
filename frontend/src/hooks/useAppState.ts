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
    updateCalendarFilterSettings,
    updateChildTimelineSettings,
    updateMemberNavigation,
    assignRole,
    clearMemberAvatar
  } = useMembersState();
  const todosState = useTodosState();
  const calendarsState = useCalendarsState();
  const shoppingState = useShoppingState();
  const rewardsState = useRewardsState();

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
    if (panel !== "home") setSelectedDashboardMemberIdRaw(null);
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
    updateCalendarFilterSettings,
    updateChildTimelineSettings,
    updateMemberNavigation,
    assignRole,
    clearMemberAvatar,
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
