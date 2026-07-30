import { hasPermission, canSeeMembersPanel } from "../utils/permissions";
import type { Member, Role } from "@shared/types";

export type ShellPermissions = {
  canManageRoles: boolean;
  canManageMembers: boolean;
  canSeeMembers: boolean;
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
    // Medlemsvyn (2026-07-30) — default PÅ/opt-out, se canSeeMembersPanel.
    // Fristående från canManageMembers (som fortsatt styr att HANTERA/
    // radera/bjuda in medlemmar, oförändrat).
    canSeeMembers:    canSeeMembersPanel(member, roles),
    canSeeCalendar:   hasPermission(member, roles, "canSeeAllCalendar") || hasPermission(member, roles, "canSeeOwnCalendar"),
    canSeeTodos:      hasPermission(member, roles, "canSeeAllTodos") || hasPermission(member, roles, "canSeeOwnTodos"),
    canSeeShopping:   hasPermission(member, roles, "canSeeShoppingLists"),
    canViewTrash:     hasPermission(member, roles, "canViewTrash"),
    canApproveTodos:  hasPermission(member, roles, "canApproveTodos"),
    isParent:         !member.isChild && hasPermission(member, roles, "canManageChildTodos")
  };
}
