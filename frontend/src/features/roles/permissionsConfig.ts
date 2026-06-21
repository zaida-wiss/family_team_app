import type { PermissionKey, Role } from "@shared/types";

export const availablePermissions: Array<{
  key: PermissionKey;
  label: string;
  group: string;
}> = [
  { key: "canManageMembers", label: "Hantera medlemmar", group: "Admin" },
  { key: "canManageRoles", label: "Hantera roller", group: "Admin" },
  { key: "canCreateChildAccounts", label: "Skapa barnkonton", group: "Familj" },
  { key: "canManageChildTodos", label: "Hantera barns uppgifter", group: "Familj" },
  { key: "canSeeAllTodos", label: "Se alla todos", group: "Todos" },
  { key: "canSeeOwnTodos", label: "Se egna todos", group: "Todos" },
  { key: "canCreateTodos", label: "Skapa todos", group: "Todos" },
  { key: "canScheduleRecurringTodos", label: "Schemalägga todos", group: "Todos" },
  { key: "canCompleteAssignedTodos", label: "Markera tilldelade klara", group: "Todos" },
  { key: "canEditAnyTodos", label: "Redigera alla todos", group: "Todos" },
  { key: "canDeleteAnyTodos", label: "Radera alla todos", group: "Todos" },
  { key: "canApproveTodos", label: "Godkänna barns uppgifter", group: "Todos" },
  { key: "canSeeAllCalendar", label: "Se alla kalendrar", group: "Kalender" },
  { key: "canSeeOwnCalendar", label: "Se egen kalender", group: "Kalender" },
  { key: "canCreateCalendar", label: "Skapa kalender", group: "Kalender" },
  { key: "canEditCalendar", label: "Redigera kalender", group: "Kalender" },
  { key: "canImportCalendar", label: "Importera kalender", group: "Kalender" },
  { key: "canExportCalendar", label: "Exportera kalender", group: "Kalender" },
  { key: "canSeeShoppingLists", label: "Se inköpslistor", group: "Inköp" },
  { key: "canCreateShoppingLists", label: "Skapa inköpslistor", group: "Inköp" },
  { key: "canEditShoppingLists", label: "Redigera inköpslistor", group: "Inköp" },
  { key: "canViewTrash", label: "Se papperskorg", group: "Papperskorg" },
  { key: "canRestoreFromTrash", label: "Återställa från papperskorg", group: "Papperskorg" }
];

export function createPermissionMap(
  enabledPermissions: PermissionKey[] = []
): Role["permissions"] {
  return availablePermissions.reduce<Role["permissions"]>((permissions, item) => {
    permissions[item.key] = enabledPermissions.includes(item.key);
    return permissions;
  }, {} as Role["permissions"]);
}

export function getPermissionGroups() {
  return Array.from(new Set(availablePermissions.map((permission) => permission.group)));
}
