import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
  availablePermissions,
  createPermissionMap,
  getPermissionGroups
} from "./permissionsConfig";
import type { Id, Member, PermissionKey, Role } from "@shared/types";

type RoleEditorProps = {
  roles: Role[];
  members: Member[];
  onCreateRole: (role: Role) => void;
  onTogglePermission: (roleId: Id, permission: PermissionKey) => void;
  onAssignRole: (memberId: Id, roleId: Id) => void;
};

export function RoleEditor({
  roles,
  members,
  onCreateRole,
  onTogglePermission,
  onAssignRole
}: RoleEditorProps) {
  const [roleName, setRoleName] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<PermissionKey[]>([]);

  function toggleDraftPermission(permission: PermissionKey) {
    setDraftPermissions((current) => {
      if (current.includes(permission)) {
        return current.filter((item) => item !== permission);
      }

      return [...current, permission];
    });
  }

  function handleCreateRole() {
    const trimmedName = roleName.trim();

    if (!trimmedName) {
      return;
    }

    onCreateRole({
      id: `role-${crypto.randomUUID()}`,
      name: trimmedName,
      permissions: createPermissionMap(draftPermissions)
    });

    setRoleName("");
    setDraftPermissions([]);
  }

  return (
    <article className="role-editor">
      <header className="section-header">
        <div>
          <p className="eyebrow">Inställningar</p>
          <h2>Roller och behörigheter</h2>
        </div>
        <ShieldCheck size={24} />
      </header>

      <div className="role-layout">
        <section className="role-create-panel" aria-labelledby="new-role-title">
          <h3 id="new-role-title">Skapa roll</h3>
          <label className="field-label">
            Rollnamn
            <input
              className="text-input"
              onChange={(event) => setRoleName(event.target.value)}
              placeholder="Till exempel Barnvakt"
              value={roleName}
            />
          </label>

          <PermissionGrid
            selectedPermissions={draftPermissions}
            onToggle={toggleDraftPermission}
          />

          <button className="primary-button" onClick={handleCreateRole} type="button">
            Spara roll
          </button>
        </section>

        <section className="role-list-panel" aria-label="Befintliga roller">
          {roles.map((role) => (
            <div className="role-card" key={role.id}>
              <div className="role-card-header">
                <h3>{role.name}</h3>
                <span>{countEnabledPermissions(role)} aktiva</span>
              </div>

              <PermissionGrid
                selectedPermissions={availablePermissions
                  .filter((permission) => role.permissions[permission.key])
                  .map((permission) => permission.key)}
                onToggle={(permission) => onTogglePermission(role.id, permission)}
              />
            </div>
          ))}
        </section>
      </div>

      <section className="member-role-panel" aria-label="Tilldela roller">
        <h3>Tilldela roll</h3>
        <div className="member-role-grid">
          {members.map((member) => (
            <label className="member-role-row" key={member.id}>
              <span>{member.name}</span>
              <select
                onChange={(event) => onAssignRole(member.id, event.target.value)}
                value={member.roleId}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>
    </article>
  );
}

function PermissionGrid({
  selectedPermissions,
  onToggle
}: {
  selectedPermissions: PermissionKey[];
  onToggle: (permission: PermissionKey) => void;
}) {
  return (
    <div className="permission-groups">
      {getPermissionGroups().map((group) => (
        <fieldset className="permission-group" key={group}>
          <legend>{group}</legend>
          {availablePermissions
            .filter((permission) => permission.group === group)
            .map((permission) => (
              <label className="checkbox-row" key={permission.key}>
                <input
                  checked={selectedPermissions.includes(permission.key)}
                  onChange={() => onToggle(permission.key)}
                  type="checkbox"
                />
                <span>{permission.label}</span>
              </label>
            ))}
        </fieldset>
      ))}
    </div>
  );
}

function countEnabledPermissions(role: Role) {
  return availablePermissions.filter((permission) => role.permissions[permission.key])
    .length;
}
