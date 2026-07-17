import { useEffect, useState } from "react";
import { rolesApi } from "../../api";
import { readCache, writeCache } from "../../utils/localCache";
import type { Id, PermissionKey, Role } from "@shared/types";

const ROLES_CACHE_KEY = "roles_v1";

export function useRolesState() {
  // Stale-while-revalidate (2026-07-17) — roller behövs för att avgöra
  // behörigheter överallt i appen (hasPermission), måste finnas offline för
  // att appen ens ska fungera meningsfullt utan nät.
  const [roles, setRoles] = useState<Role[]>(() => readCache(ROLES_CACHE_KEY, []));

  useEffect(() => {
    rolesApi.getAll().then(setRoles).catch(console.error);
  }, []);

  useEffect(() => {
    writeCache(ROLES_CACHE_KEY, roles);
  }, [roles]);

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
