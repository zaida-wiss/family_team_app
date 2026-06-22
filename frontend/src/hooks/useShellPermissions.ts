import { hasPermission } from "../utils/permissions";
import type { Member, Role } from "@shared/types";

export type ShellPermissions = {
  canManageRoles: boolean;
  canManageMembers: boolean;
  canSeeCalendar: boolean;
  canSeeTodos: boolean;
  canSeeShopping: boolean;
  canViewTrash: boolean;
  canApproveTodos: boolean;
  isParent: boolean;
};

export function useShellPermissions(member: Member, roles: Role[]): ShellPermissions {
  return {
    canManageRoles:   hasPermission(member, roles, "canManageRoles"),
    canManageMembers: hasPermission(member, roles, "canManageMembers"),
    canSeeCalendar:   hasPermission(member, roles, "canSeeAllCalendar") || hasPermission(member, roles, "canSeeOwnCalendar"),
    canSeeTodos:      hasPermission(member, roles, "canSeeAllTodos") || hasPermission(member, roles, "canSeeOwnTodos"),
    canSeeShopping:   hasPermission(member, roles, "canSeeShoppingLists"),
    canViewTrash:     hasPermission(member, roles, "canViewTrash"),
    canApproveTodos:  hasPermission(member, roles, "canApproveTodos"),
    isParent:         !member.isChild && hasPermission(member, roles, "canManageChildTodos")
  };
}
