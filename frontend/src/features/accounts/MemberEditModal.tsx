import "./MemberEditModal.css";
import { ImagePlus, Loader, Trash2, X } from "lucide-react";
import { useState } from "react";
import { uploadImage } from "../../utils/uploadImage";
import { reportApiError } from "../../api";
import { MemberAvatar } from "../../components/MemberAvatar";
import { useModalA11y } from "../../hooks/useModalA11y";
import { canViewResource } from "../../utils/permissions";
import type { AccessLevel, Calendar, Id, Member, Role } from "@shared/types";

type MemberEditModalProps = {
  member: Member;
  currentMember: Member;
  roles: Role[];
  calendars: Calendar[];
  onUpdateName: (memberId: Id, name: string) => void;
  onUpdateColor: (memberId: Id, color: string | null) => void;
  onUpdateAvatar: (memberId: Id, avatarUrl: string | null) => void;
  onSetChildCredentials: (memberId: Id, username: string, password: string) => Promise<{ id: string; username: string }>;
  onShareCalendar: (calendarId: Id, memberId: Id, access: AccessLevel) => void;
  onRemoveCalendarShare: (calendarId: Id, memberId: Id) => void;
  onDelete: (memberId: Id) => void;
  onClose: () => void;
};

// Redigera-medlem-modal (2026-07-22, Zaidas beslut: "det bör endast finnas en
// redigera symbol på varje familjemedlem och där inne i en modal borde alla
// andra knappar finnas") — ersätter den tidigare raden av separata
// ikon-knappar (färg/bild/inloggning/kalenderåtkomst/radera) direkt i
// AccountSettings.tsx:s medlemslista med EN pennikon som öppnar denna modal.
// Namnredigering är nytt (samma tillfälle, Zaidas önskemål: "jag vill även
// kunna uppdatera namnet på familjemedlemmen om det behövs") — backend
// stödjer redan name i MemberPatchSchema, bara ingen UI fanns.
export function MemberEditModal({
  member,
  currentMember,
  roles,
  calendars,
  onUpdateName,
  onUpdateColor,
  onUpdateAvatar,
  onSetChildCredentials,
  onShareCalendar,
  onRemoveCalendarShare,
  onDelete,
  onClose
}: MemberEditModalProps) {
  const [name, setName] = useState(member.name);
  const [uploading, setUploading] = useState(false);
  const [credentialsUsername, setCredentialsUsername] = useState("");
  const [credentialsPassword, setCredentialsPassword] = useState("");
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isChildMember = member.isChild || roles.find((r) => r.id === member.roleId)?.isChildRole;
  const otherCalendars = calendars.filter((c) => c.ownerId !== member.id && c.deletedAt === null);
  const isSelf = member.id === currentMember.id;

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === member.name) {
      setName(member.name);
      return;
    }
    onUpdateName(member.id, trimmed);
  }

  async function updateAvatar(file: File | null) {
    if (!file || uploading) return;
    setUploading(true);
    try {
      const avatarUrl = await uploadImage(file, "avatars");
      onUpdateAvatar(member.id, avatarUrl);
    } catch {
      reportApiError("Bilden kunde inte laddas upp");
    } finally {
      setUploading(false);
    }
  }

  async function saveChildCredentials() {
    if (!credentialsUsername.trim() || !credentialsPassword || credentialsSaving) return;
    setCredentialsError(null);
    setCredentialsSaving(true);
    try {
      await onSetChildCredentials(member.id, credentialsUsername.trim(), credentialsPassword);
      setCredentialsUsername("");
      setCredentialsPassword("");
      setCredentialsSaved(true);
      window.setTimeout(() => setCredentialsSaved(false), 2500);
    } catch (err) {
      setCredentialsError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setCredentialsSaving(false);
    }
  }

  function handleDelete() {
    if (isSelf) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(member.id);
  }

  const dialogRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className="member-edit-overlay" onClick={onClose}>
      <div
        aria-labelledby="member-edit-title"
        aria-modal="true"
        className="member-edit-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="member-edit-modal__hdr">
          <span id="member-edit-title">Redigera {member.name}</span>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="member-edit-modal__body">
          <div className="member-edit-modal__avatar-row">
            <MemberAvatar member={member} size="small" />
            <label
              aria-label={`Välj bild för ${member.name}`}
              className={`icon-button${uploading ? " icon-button--loading" : ""}`}
              title="Välj bild"
            >
              {uploading ? <Loader size={16} className="spin" /> : <ImagePlus size={16} />}
              <input
                accept="image/*"
                disabled={uploading}
                hidden
                onChange={(event) => {
                  void updateAvatar(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            {member.avatarUrl ? (
              <button
                aria-label={`Ta bort bild för ${member.name}`}
                className="icon-button"
                onClick={() => onUpdateAvatar(member.id, null)}
                title="Ta bort bild"
                type="button"
              >
                <X size={16} />
              </button>
            ) : null}
            <label
              aria-label={`Välj färg för ${member.name}`}
              className="member-color-picker"
              style={{ background: member.color ?? "var(--border)" }}
              title="Välj färg"
            >
              <input
                hidden
                onChange={(e) => onUpdateColor(member.id, e.target.value)}
                type="color"
                value={member.color ?? "#888888"}
              />
            </label>
          </div>

          <label className="field-label">
            Namn
            <input
              className="text-input"
              onBlur={commitName}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setName(member.name);
              }}
              value={name}
            />
          </label>
          <small className="member-edit-modal__role">
            {roles.find((r) => r.id === member.roleId)?.name ?? (member.isChild ? "Barn" : "Medlem")}
          </small>

          {isChildMember && (
            <div className="member-edit-modal__section">
              <h4 className="settings-sub-title">{member.userId ? "Ändra inloggning" : "Skapa egen inloggning"}</h4>
              <div className="settings-child-credentials">
                <label className="field-label">
                  Användarnamn
                  <input
                    autoComplete="off"
                    className="text-input"
                    onChange={(e) => setCredentialsUsername(e.target.value)}
                    placeholder="t.ex. nova"
                    value={credentialsUsername}
                  />
                </label>
                <label className="field-label">
                  Lösenord
                  <input
                    autoComplete="new-password"
                    className="text-input"
                    minLength={4}
                    onChange={(e) => setCredentialsPassword(e.target.value)}
                    placeholder="Minst 4 tecken"
                    type="password"
                    value={credentialsPassword}
                  />
                </label>
                {credentialsError && <p className="field-hint" role="alert">{credentialsError}</p>}
                {credentialsSaved && <p className="settings-sub-desc" role="status">Inloggning sparad.</p>}
                <p className="settings-sub-desc">
                  {member.name} loggar in med DIN e-postadress + användarnamnet + lösenordet ovan, via Logga in
                  som barn på inloggningssidan.
                </p>
                <button
                  className="secondary-button"
                  disabled={credentialsSaving || !credentialsUsername.trim() || !credentialsPassword}
                  onClick={saveChildCredentials}
                  type="button"
                >
                  {credentialsSaving ? "…" : "Spara inloggning"}
                </button>
              </div>
            </div>
          )}

          {isChildMember && otherCalendars.length > 0 && (
            <div className="member-edit-modal__section">
              <h4 className="settings-sub-title">Kalenderåtkomst</h4>
              <div className="member-edit-modal__cal-list">
                {otherCalendars.map((cal) => (
                  <label className="cal-filter-item" key={cal.id}>
                    <input
                      type="checkbox"
                      checked={canViewResource(member, cal)}
                      onChange={(e) => {
                        if (e.target.checked) onShareCalendar(cal.id, member.id, "view");
                        else onRemoveCalendarShare(cal.id, member.id);
                      }}
                    />
                    <span className="cal-filter-dot" style={{ background: cal.color }} />
                    <span>{cal.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="member-edit-modal__section">
            <button
              className={`secondary-button danger-action${confirmDelete ? " confirming" : ""}`}
              disabled={isSelf}
              onClick={handleDelete}
              title={isSelf ? "Du kan inte radera dig själv här" : "Flytta till papperskorg"}
              type="button"
            >
              <Trash2 size={16} />
              {isSelf ? "Kan inte radera dig själv" : confirmDelete ? "Bekräfta radering" : "Radera medlem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
