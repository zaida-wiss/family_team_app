import { ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  availablePermissions,
  createPermissionMap,
  getPermissionGroups
} from "./permissionsConfig";
import { generateId } from "../../utils/uuid";
import styles from "./RoleEditor.module.css";
import type { Id, Member, PermissionKey, Role } from "@shared/types";

type RoleEditorProps = {
  roles: Role[];
  members: Member[];
  onCreateRole: (role: Omit<Role, "accountId">) => void;
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
  const [showDraftPerms, setShowDraftPerms] = useState(false);
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);

  function toggleDraftPermission(permission: PermissionKey) {
    setDraftPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  }

  function handleCreateRole() {
    const trimmedName = roleName.trim();
    if (!trimmedName) return;
    onCreateRole({
      id: `role-${generateId()}`,
      name: trimmedName,
      isChildRole: false,
      permissions: createPermissionMap(draftPermissions)
    });
    setRoleName("");
    setDraftPermissions([]);
    setShowDraftPerms(false);
  }

  return (
    <>
      <div className="settings-sub">
        <h3 className="settings-sub-title">Skapa roll</h3>
        <label className="field-label">
          Rollnamn
          <input
            className="text-input"
            onChange={(event) => setRoleName(event.target.value)}
            placeholder="Till exempel Barnvakt"
            value={roleName}
          />
        </label>
        <div className={`${styles.permsWrap}${showDraftPerms ? ` ${styles.permsWrapOpen}` : ""}`}>
          <button
            className={styles.permsToggle}
            onClick={() => setShowDraftPerms((v) => !v)}
            type="button"
          >
            <span>
              Behörigheter
              {draftPermissions.length > 0 && (
                <span className={styles.permsBadge}>{draftPermissions.length}</span>
              )}
            </span>
            <ChevronDown className="settings-chevron" size={16} />
          </button>
          <div className={styles.permsBody}>
            <div className={styles.permsInner}>
              <PermissionGrid
                selectedPermissions={draftPermissions}
                onToggle={toggleDraftPermission}
              />
            </div>
          </div>
        </div>
        <button className="primary-button" onClick={handleCreateRole} type="button">
          Spara roll
        </button>
      </div>

      <div className="settings-sub">
        <h3 className="settings-sub-title">Befintliga roller</h3>
        {roles.map((role) => {
          const isOpen = openRoleId === role.id;
          return (
            <div className={`${styles.card}${isOpen ? ` ${styles.cardOpen}` : ""}`} key={role.id}>
              <button
                className={styles.cardToggle}
                onClick={() => setOpenRoleId(isOpen ? null : role.id)}
                type="button"
              >
                <span className={styles.cardName}>{role.name}</span>
                <div className={styles.cardToggleRight}>
                  <span>{countEnabledPermissions(role)} aktiva</span>
                  <ChevronDown className="settings-chevron" size={16} />
                </div>
              </button>
              <div className={styles.permsBody}>
                <div className={styles.permsInner}>
                  <PermissionGrid
                    selectedPermissions={availablePermissions
                      .filter((p) => role.permissions[p.key])
                      .map((p) => p.key)}
                    onToggle={(permission) => onTogglePermission(role.id, permission)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="settings-sub">
        <h3 className="settings-sub-title">Tilldela roll</h3>
        <div className={styles.memberRoleGrid}>
          {members.map((member) => (
            <label className={styles.memberRoleRow} key={member.id}>
              <span>{member.name}</span>
              <select
                onChange={(event) => onAssignRole(member.id, event.target.value)}
                value={member.roleId}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </>
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
    <div className={styles.permissionGroups}>
      {getPermissionGroups().map((group) => (
        <fieldset className={styles.permissionGroup} key={group}>
          <legend>{group}</legend>
          {availablePermissions
            .filter((permission) => permission.group === group)
            .map((permission) => (
              <label className={styles.checkboxRow} key={permission.key}>
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
  return availablePermissions.filter((permission) => role.permissions[permission.key]).length;
}
