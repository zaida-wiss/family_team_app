import { useEffect, useState } from "react";
import { setApiErrorHandler, setApiMemberId } from "../api";
import { useAccountState } from "../features/accounts/useAccountState";
import { useCalendarsState } from "../features/calendars/useCalendarsState";
import { useMembersState } from "../features/members/useMembersState";
import { useRewardsState } from "../features/rewards/useRewardsState";
import { hasPermission } from "../features/roles/permissions";
import { useRolesState } from "../features/roles/useRolesState";
import { useShoppingState } from "../features/shopping/useShoppingState";
import { useTodosState } from "../features/todos/useTodosState";
import type { Account, Id, Member } from "@shared/types";

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
    assignRole,
    clearMemberAvatar
  } = useMembersState();
  const todosState = useTodosState();
  const calendarsState = useCalendarsState();
  const shoppingState = useShoppingState();
  const rewardsState = useRewardsState();

  const [selectedDashboardMemberId, setSelectedDashboardMemberId] = useState<Id | null>(null);
  const [themePickerMemberId, setThemePickerMemberId] = useState<Id | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

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

  const permissions = {
    canManageMembers: hasPermission(currentMember, roles, "canManageMembers"),
    canManageRoles: hasPermission(currentMember, roles, "canManageRoles"),
    canSeeCalendar:
      hasPermission(currentMember, roles, "canSeeAllCalendar") ||
      hasPermission(currentMember, roles, "canSeeOwnCalendar"),
    canSeeTodos:
      hasPermission(currentMember, roles, "canSeeAllTodos") ||
      hasPermission(currentMember, roles, "canSeeOwnTodos"),
    canSeeShopping: hasPermission(currentMember, roles, "canSeeShoppingLists"),
    canViewTrash: hasPermission(currentMember, roles, "canViewTrash"),
    canApproveTodos: hasPermission(currentMember, roles, "canApproveTodos"),
    isParent:
      !currentMember.isChild && hasPermission(currentMember, roles, "canManageChildTodos")
  };

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
    showSettings,
    setShowSettings,
    apiError
  };
}
