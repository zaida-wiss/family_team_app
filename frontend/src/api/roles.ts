import type { Role } from "@shared/types";
import { api, request } from "./client";

export const rolesApi = {
  getAll: () => request<Role[]>(api("roles")),
  create: (role: Role) =>
    request<{ id: string }>(api("roles"), { method: "POST", body: JSON.stringify(role) }),
  updatePermissions: (id: string, permissions: Role["permissions"]) =>
    request<{ ok: boolean }>(api(`roles/${id}/permissions`), {
      method: "PATCH",
      body: JSON.stringify(permissions)
    })
};
