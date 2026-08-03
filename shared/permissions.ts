import type {
  AccessLevel,
  Calendar,
  Member,
  OwnedSharedResource,
  PermissionKey,
  Role,
  ShoppingList,
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

// En delning måste vara accepterad AV MOTTAGAREN och inte ha gått ut för att
// räknas som aktiv (2026-07-29, ADR-0024-uppföljning) — status saknas på
// äldre, redan levande delningar (skapade innan accept-steget fanns) och
// tolkas då som redan accepterade, så de inte plötsligt tappar åtkomst.
export function isShareActive(share: { status?: "pending" | "accepted"; expiresAt?: string | null }): boolean {
  if ((share.status ?? "accepted") !== "accepted") return false;
  if (!share.expiresAt) return true;
  return new Date(share.expiresAt).getTime() > Date.now();
}

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22) — Member.childSharedWith. memberId+accountId kollas EXPLICIT
// (inte bara memberId) som försvar på djupet, även om id:n redan är
// globalt unika UUID:n.
export function getChildShareAccess(caller: Member, child: Member): AccessLevel | null {
  const grant = (child.childSharedWith ?? []).find(
    (share) => share.memberId === caller.id && share.accountId === caller.accountId
  );
  if (!grant || !isShareActive(grant)) return null;
  return grant.access;
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

// Se Medlemmar-panelen (2026-07-30, Zaidas önskemål: "alla familjemedlemmar
// skall kunna se den, och möjlighet att välja bort det alternativet på en
// egen roll" — tidigare var HELA panelen felaktigt gated bakom
// canManageMembers, så bara admins kunde ens öppna listan). Medvetet INTE
// hasPermission(...)==="true" (strikt, default AV) som alla andra 23
// behörigheter — den här är default PÅ, opt-OUT: en roll skapad INNAN
// canSeeMembers fanns saknar nyckeln helt (undefined), vilket ska tolkas
// som "får se", inte "får inte se" — annars hade denna ändring tyst stängt
// av panelen för alla befintliga roller i produktion. Bara ett uttryckligt
// `false` (satt via RoleEditor) stänger av den för en specifik roll.
export function canSeeMembersPanel(member: Member, roles: Role[]): boolean {
  const role = roles.find((r) => r.id === member.roleId);
  return role?.permissions.canSeeMembers !== false;
}

// Familjeanslutningar (ADR-0030, 2026-07-29) — koppla ihop HELA konton,
// sida vid sida med Dela barn ovan (inte en ersättning). Bara en admin
// (canManageMembers) i MITT EGET konto får skicka/hantera MIN EGEN halva av
// en anslutning — samma admin-krav som canManageChildShares, men utan
// kopplingen till ett specifikt barn eftersom detta är kontobrett.
export function canManageFamilyConnections(caller: Member, roles: Role[]): boolean {
  return hasPermission(caller, roles, "canManageMembers");
}

// Delning av inköpslistor mellan FAMILJER (ADR-0026, 2026-07-23) — samma
// icke-transitiva mönster som childSharedWith ovan, fast för ShoppingList.
export function getExternalShoppingListAccess(
  caller: Member,
  list: ShoppingList
): AccessLevel | null {
  const grant = (list.externalSharedWith ?? []).find(
    (share) => share.memberId === caller.id && share.accountId === caller.accountId
  );
  return grant?.access ?? null;
}

// Lägre tröskel än canManageChildShares (som kräver canManageMembers) — en
// inköpslista är en lägre-insats-resurs än ett barns konto, så samma
// behörighet som redan gate:ar VANLIG (intern) delning av listan räcker:
// den som redan får redigera/dela listan inom familjen får också dela den
// UTANFÖR familjen. Kräver ändå att anroparen är i listans EGET konto —
// en mottagare som bara har åtkomst via externalSharedWith kan därför
// strukturellt aldrig dela vidare, oavsett egen roll i sitt eget konto.
export function canManageExternalShoppingListShares(
  caller: Member,
  list: ShoppingList,
  roles: Role[]
): boolean {
  return (
    caller.accountId === list.accountId &&
    hasPermission(caller, roles, "canEditShoppingLists") &&
    canEditSharedResource(caller, list)
  );
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
