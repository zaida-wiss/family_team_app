import type {
  AccessLevel,
  Calendar,
  Member,
  OwnedSharedResource,
  PermissionKey,
  Role,
  Todo
} from "./types.js";

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
  // Familjen (2026-07-23) — en todo utan tilldelad mottagare (assignedTo:
  // null) hör inte till någon specifik person, så vem som helst i kontot
  // får markera den klar. Ingen risk för missbruk: assignedMemberNeedsApproval
  // returnerar redan false för null, så ingen godkännande-väg kringgås, och
  // inga stjärnor delas ut (kräver en riktig mottagare, se todosService.ts).
  if (!todo.assignedTo) {
    return true;
  }
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

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22) — Member.childSharedWith. memberId+accountId kollas EXPLICIT
// (inte bara memberId) som försvar på djupet, även om id:n redan är
// globalt unika UUID:n.
export function getChildShareAccess(caller: Member, child: Member): AccessLevel | null {
  const grant = (child.childSharedWith ?? []).find(
    (share) => share.memberId === caller.id && share.accountId === caller.accountId
  );
  return grant?.access ?? null;
}

// En förälder i barnets EGET konto med canManageChildTodos har redan full
// åtkomst via den befintliga vägen (canManageChildAccount nedan) — den här
// funktionen lägger till en KOMPLETTERANDE väg för scopade delningar (en
// vuxen utan canManageChildTodos i samma konto, ELLER en vuxen i ETT ANNAT
// konto helt och hållet).
export function canAccessChildTodos(
  caller: Member,
  child: Member,
  roles: Role[]
): AccessLevel | null {
  if (canManageChildAccount(caller, child, roles)) {
    return "edit";
  }
  return getChildShareAccess(caller, child);
}

// Icke-transitivt BY CONSTRUCTION, inte en flagga (ADR-0024) — bara en
// medlem i barnets EGET konto med canManageMembers får skapa/återkalla en
// delning. En mottagare som bara har åtkomst via childSharedWith är per
// definition INTE en fullvärdig medlem av barnets konto (annars hade de
// redan haft vanlig kontoåtkomst och behövt ingen delning) — de kan därför
// strukturellt aldrig uppfylla det här villkoret, oavsett egen roll i sitt
// eget konto.
export function canManageChildShares(
  caller: Member,
  child: Member,
  roles: Role[]
): boolean {
  return isSameAccount(caller, child) && hasPermission(caller, roles, "canManageMembers");
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
