import type {
  AccessLevel,
  Calendar,
  Member,
  OwnedSharedResource,
  PermissionKey,
  Role,
  Todo
} from "@shared/types";

export function getRoleForMember(member: Member, roles: Role[]): Role {
  const role = roles.find((candidate) => candidate.id === member.roleId);

  if (!role) {
    throw new Error(`Member ${member.id} has no valid role`);
  }

  return role;
}

export function hasPermission(
  member: Member,
  roles: Role[],
  permission: PermissionKey
): boolean {
  const role = roles.find((r) => r.id === member.roleId);
  return role?.permissions[permission] === true;
}

export function getShareAccess(
  member: Member,
  resource: OwnedSharedResource
): AccessLevel | null {
  if (resource.ownerId === member.id) {
    return "edit";
  }

  return (
    resource.sharedWith.find((share) => share.memberId === member.id)?.access ??
    null
  );
}

export function canViewResource(
  member: Member,
  resource: OwnedSharedResource
): boolean {
  return getShareAccess(member, resource) !== null;
}

export function canEditSharedResource(
  member: Member,
  resource: OwnedSharedResource
): boolean {
  return getShareAccess(member, resource) === "edit";
}

export function canEditTodo(
  member: Member,
  roles: Role[],
  todo: Todo
): boolean {
  return (
    todo.createdBy === member.id ||
    hasPermission(member, roles, "canEditAnyTodos")
  );
}

export function canDeleteTodo(
  member: Member,
  roles: Role[],
  todo: Todo
): boolean {
  return (
    todo.createdBy === member.id ||
    hasPermission(member, roles, "canDeleteAnyTodos")
  );
}

export function canCompleteTodo(
  member: Member,
  roles: Role[],
  todo: Todo
): boolean {
  return (
    todo.assignedTo === member.id &&
    hasPermission(member, roles, "canCompleteAssignedTodos")
  );
}

export function isSameAccount(member: Member, otherMember: Member): boolean {
  return member.accountId === otherMember.accountId;
}

export function canManageChildAccount(
  adult: Member,
  child: Member,
  roles: Role[]
): boolean {
  return (
    child.isChild &&
    isSameAccount(adult, child) &&
    hasPermission(adult, roles, "canManageChildTodos")
  );
}

export function canCreateChildAccount(member: Member, roles: Role[]): boolean {
  return hasPermission(member, roles, "canCreateChildAccounts");
}

export function canExportCalendar(
  member: Member,
  roles: Role[],
  calendar: Calendar
): boolean {
  if (!hasPermission(member, roles, "canExportCalendar")) {
    return false;
  }

  return getShareAccess(member, calendar) === "edit";
}
