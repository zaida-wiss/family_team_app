import { Eraser, ImagePlus, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { MemberAvatar } from "../../components/MemberAvatar";
import { hasPermission } from "../../utils/permissions";
import type { Account, Member, Role } from "@shared/types";

type AccountSettingsProps = {
  account: Account;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  onCreateMember: (member: Member) => void;
  onDeleteMember: (memberId: string) => void;
  onDeleteOwnData: () => void;
  onUpdateMemberAvatar: (memberId: string, avatarUrl: string | null) => void;
  onUpdateMemberColor: (memberId: string, color: string | null) => void;
};

export function AccountSettings({
  account,
  currentMember,
  members,
  roles,
  onCreateMember,
  onDeleteMember,
  onDeleteOwnData,
  onUpdateMemberAvatar,
  onUpdateMemberColor
}: AccountSettingsProps) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [confirmOwnDataDelete, setConfirmOwnDataDelete] = useState(false);

  const canManageMembers = hasPermission(currentMember, roles, "canManageMembers");

  function createMember() {
    const trimmedName = name.trim();

    if (!trimmedName || !roleId || !canManageMembers) {
      return;
    }

    const selectedRole = roles.find((r) => r.id === roleId);
    const isChild = selectedRole?.isChildRole ?? false;

    onCreateMember({
      id: `member-${crypto.randomUUID()}`,
      accountId: account.id,
      userId: null,
      name: trimmedName,
      roleId,
      isChild,
      avatarUrl: null,
      color: null,
      dashboardTheme: isChild ? "space" : "focus",
      deletedAt: null,
      deletedBy: null
    });

    setName("");
  }

  async function updateAvatar(memberId: string, file: File | null) {
    if (!file || !canManageMembers) {
      return;
    }

    const avatarUrl = await readFileAsDataUrl(file);
    onUpdateMemberAvatar(memberId, avatarUrl);
  }

  function deleteOwnData() {
    if (!confirmOwnDataDelete) {
      setConfirmOwnDataDelete(true);
      return;
    }

    onDeleteOwnData();
    setConfirmOwnDataDelete(false);
  }

  return (
    <article className="account-settings">
      <header className="section-header">
        <div>
          <p className="eyebrow">Inställningar</p>
          <h2>Familjekonto</h2>
        </div>
        <UserPlus size={24} />
      </header>

      <div className="settings-grid">
        <section className="settings-form">
          {canManageMembers && (
            <>
              <h3>Skapa medlem</h3>

              <label className="field-label">
                Namn
                <input
                  className="text-input"
                  onChange={(event) => setName(event.target.value)}
                  placeholder={account.type === "family" ? "Barn eller vuxen" : "Kollega"}
                  value={name}
                />
              </label>

              <label className="field-label">
                Roll
                <select
                  className="text-input"
                  onChange={(event) => setRoleId(event.target.value)}
                  value={roleId}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="primary-button"
                onClick={createMember}
                type="button"
              >
                Lägg till
              </button>
            </>
          )}

          <section className="self-data-card" aria-label="Radera min data">
            <div>
              <p className="eyebrow">Min data</p>
              <h3>Radera mina sparade data</h3>
              <p>
                Tar bort profilbild och flyttar egna todos, kalendrar och
                inköpslistor till raderat läge.
              </p>
            </div>
            <button
              className={`secondary-button danger-action ${
                confirmOwnDataDelete ? "confirming" : ""
              }`}
              onClick={deleteOwnData}
              type="button"
            >
              <Eraser size={16} />
              {confirmOwnDataDelete ? "Bekräfta radering" : "Radera min data"}
            </button>
          </section>
        </section>

        {canManageMembers && (
          <section className="settings-members" aria-label="Medlemmar i kontot">
            <h3>Medlemmar</h3>
            <div className="settings-member-list">
              {members
                .filter((member) => member.accountId === account.id && member.deletedAt === null)
                .map((member) => (
                  <div className="settings-member-row" key={member.id}>
                    <MemberAvatar member={member} size="small" />
                    <div style={{ flex: 1 }}>
                      <strong>{member.name}</strong>
                      <small>{member.isChild ? "Barnkonto" : "Vuxen/medlem"}</small>
                    </div>
                    <label
                      aria-label={`Välj färg för ${member.name}`}
                      className="member-color-picker"
                      style={{ background: member.color ?? "var(--border)" }}
                      title="Välj färg"
                    >
                      <input
                        hidden
                        onChange={(e) => onUpdateMemberColor(member.id, e.target.value)}
                        type="color"
                        value={member.color ?? "#888888"}
                      />
                    </label>
                    <label
                      aria-label={`Välj bild för ${member.name}`}
                      className="icon-button"
                      title={`Välj bild för ${member.name}`}
                    >
                      <ImagePlus size={16} />
                      <input
                        accept="image/*"
                        hidden
                        onChange={(event) => {
                          void updateAvatar(member.id, event.target.files?.[0] ?? null);
                          event.target.value = "";
                        }}
                        type="file"
                      />
                    </label>
                    {member.avatarUrl ? (
                      <button
                        aria-label={`Ta bort bild för ${member.name}`}
                        className="icon-button"
                        onClick={() => onUpdateMemberAvatar(member.id, null)}
                        type="button"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                    <button
                      aria-label={`Radera ${member.name}`}
                      className="icon-button danger"
                      disabled={member.id === currentMember.id}
                      onClick={() => onDeleteMember(member.id)}
                      title={
                        member.id === currentMember.id
                          ? "Du kan inte radera dig själv här"
                          : "Flytta medlem till papperskorg"
                      }
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Kunde inte läsa bildfilen"));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
