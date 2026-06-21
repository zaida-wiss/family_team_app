import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { roles as initialRoles } from "../../data/sampleData";
import type { Id, PermissionKey, Role } from "@shared/types";

export function useRolesState() {
  const [roles, setRoles] = useLocalStorageState<Role[]>(
    "family-team-app:roles",
    initialRoles
  );

  function createRole(role: Role) {
    setRoles((current) => [...current, role]);
  }

  function toggleRolePermission(roleId: Id, permission: PermissionKey) {
    setRoles((current) =>
      current.map((role) => {
        if (role.id !== roleId) {
          return role;
        }

        return {
          ...role,
          permissions: {
            ...role.permissions,
            [permission]: !role.permissions[permission]
          }
        };
      })
    );
  }

  return { roles, createRole, toggleRolePermission };
}
