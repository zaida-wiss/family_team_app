import { useEffect, useState } from "react";
import { setApiErrorHandler, setApiMemberId } from "../api";
import { useAccountState } from "../features/accounts/useAccountState";
import { useCalendarsState } from "../features/calendars/useCalendarsState";
import { useMembersState } from "../features/members/useMembersState";
import { useRewardsState } from "../features/rewards/useRewardsState";
import { useRolesState } from "../features/roles/useRolesState";
import { useShoppingState } from "../features/shopping/useShoppingState";
import { useTodosState } from "../features/todos/useTodosState";
import type { Account, Id, Member } from "@shared/types";

export type ShellPanel =
  | "home"
  | "calendar"
  | "shopping"
  | "todos"
  | "members"
  | "roles"
  | "trash"
  | "settings";

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
    assignRole,
    clearMemberAvatar
  } = useMembersState();
  const todosState = useTodosState();
  const calendarsState = useCalendarsState();
  const shoppingState = useShoppingState();
  const rewardsState = useRewardsState();

  const [selectedDashboardMemberId, setSelectedDashboardMemberId] = useState<Id | null>(null);
  const [themePickerMemberId, setThemePickerMemberId] = useState<Id | null>(null);
  const [activePanel, setActivePanelRaw] = useState<ShellPanel>("home");
  const [apiError, setApiError] = useState<string | null>(null);

  function setActivePanel(panel: ShellPanel) {
    setActivePanelRaw(panel);
    if (panel !== "home") setSelectedDashboardMemberId(null);
  }

  const currentMember = initialMembership.member;

  useEffect(() => {
    setApiMemberId(currentMember.id);
  }, [currentMember.id]);

  useEffect(() => {
    setApiErrorHandler((message) => {
      setApiError(message);
      window.setTimeout(() => setApiError(null), 4000);
    });
  }, []);

  const activeMembers = members
    .filter((m) => m.deletedAt === null)
    .sort((a, b) => Number(a.isChild) - Number(b.isChild));

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
