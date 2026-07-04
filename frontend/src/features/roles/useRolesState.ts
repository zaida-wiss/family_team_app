import { useEffect, useState } from "react";
import { rolesApi } from "../../api";
import type { Id, PermissionKey, Role } from "@shared/types";

export function useRolesState() {
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    rolesApi.getAll().then(setRoles).catch(console.error);
  }, []);

  // accountId sätts alltid server-side (aldrig litat på klienten) — den optimistiska
  // lokala uppdateringen behöver ändå ett värde för typens skull tills nästa hämtning
  // ersätter den med den riktiga posten. Ingen vy läser role.accountId.
  function createRole(role: Omit<Role, "accountId">) {
    rolesApi.create(role).catch(console.error);
    setRoles((current) => [...current, { ...role, accountId: "" }]);
  }

  function toggleRolePermission(roleId: Id, permission: PermissionKey) {
    setRoles((current) =>
      current.map((role) => {
        if (role.id !== roleId) {
          return role;
        }

        const newPermissions = {
          ...role.permissions,
          [permission]: !role.permissions[permission]
        };

        rolesApi.updatePermissions(roleId, newPermissions).catch(console.error);
        return { ...role, permissions: newPermissions };
      })
    );
  }

  return { roles, createRole, toggleRolePermission };
}
