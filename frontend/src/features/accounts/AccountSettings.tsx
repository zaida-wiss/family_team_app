import "./AccountSettings.css";
import { Eraser, Filter, ImagePlus, Loader, Trash2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { uploadImage } from "../../utils/uploadImage";
import { MemberAvatar } from "../../components/MemberAvatar";
import { canViewResource, hasPermission } from "../../utils/permissions";
import type { AccessLevel, Account, Calendar, CalendarSettings, Member, Role } from "@shared/types";

const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  showWeekNumbers: false,
  showHolidays: true,
  holidayBgColor: "#ffe4e6",
  holidayTextColor: "#9f1239",
  subscriptionUrl: null,
};

type AccountSettingsProps = {
  account: Account;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  calendars: Calendar[];
  onCreateMember: (member: Member) => void;
  onDeleteMember: (memberId: string) => void;
  onDeleteOwnData: () => void;
  onUpdateMemberAvatar: (memberId: string, avatarUrl: string | null) => void;
  onUpdateMemberColor: (memberId: string, color: string | null) => void;
  onUpdateCalendarSettings: (settings: CalendarSettings) => void;
  onShareCalendar: (calendarId: string, memberId: string, access: AccessLevel) => void;
  onRemoveCalendarShare: (calendarId: string, memberId: string) => void;
};

export function AccountSettings({
  account,
  currentMember,
  members,
  roles,
  calendars,
  onCreateMember,
  onDeleteMember,
  onDeleteOwnData,
  onUpdateMemberAvatar,
  onUpdateMemberColor,
  onUpdateCalendarSettings,
  onShareCalendar,
  onRemoveCalendarShare,
}: AccountSettingsProps) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [confirmOwnDataDelete, setConfirmOwnDataDelete] = useState(false);
  const [uploadingMemberId, setUploadingMemberId] = useState<string | null>(null);
  const [openCalFilterId, setOpenCalFilterId] = useState<string | null>(null);
  const [calFilterPos, setCalFilterPos] = useState({ top: 0, left: 0 });

  const canManageMembers = hasPermission(currentMember, roles, "canManageMembers");
  const calSettings: CalendarSettings = account.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS;

  function createMember() {
    const trimmedName = name.trim();
    if (!trimmedName || !roleId || !canManageMembers) return;
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
      spentStars: 0,
      approvedStars: 0,
      deletedAt: null,
      deletedBy: null
    });
    setName("");
  }

  async function updateAvatar(memberId: string, file: File | null) {
    if (!file || !canManageMembers || uploadingMemberId) return;
    setUploadingMemberId(memberId);
    try {
      const avatarUrl = await uploadImage(file, "avatars");
      onUpdateMemberAvatar(memberId, avatarUrl);
    } catch {
      // uppladdning misslyckades — behåll befintlig bild
    } finally {
      setUploadingMemberId(null);
    }
  }

  function deleteOwnData() {
    if (!confirmOwnDataDelete) {
      setConfirmOwnDataDelete(true);
      return;
    }
    onDeleteOwnData();
    setConfirmOwnDataDelete(false);
  }

  const activeMembers = members.filter(
    (m) => m.accountId === account.id && m.deletedAt === null
  );

  return (
    <>
      {canManageMembers && (
        <div className="settings-sub">
          <h3 className="settings-sub-title">Skapa ny medl</h3>
          <label className="field-label">
            Namn
            <input
              className="text-input"
              onChange={(e) => setName(e.target.value)}
              placeholder={account.type === "family" ? "Barn eller vuxen" : "Kollega"}
              value={name}
            />
          </label>
          <label className="field-label">
            Roll
            <select
              className="text-input"
              onChange={(e) => setRoleId(e.target.value)}
              value={roleId}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          <button className="primary-button" onClick={createMember} type="button">
            Lägg till
          </button>
        </div>
      )}

      {canManageMembers && activeMembers.length > 0 && (
        <div className="settings-sub">
          <h3 className="settings-sub-title">Familjemedlemmar</h3>
          <div className="settings-member-list">
            {activeMembers.map((member) => (
              <div className="settings-member-row" key={member.id}>
                <MemberAvatar member={member} size="small" />
                <div className="settings-member-info">
                  <strong>{member.name}</strong>
                  <small>{roles.find((r) => r.id === member.roleId)?.name ?? (member.isChild ? "Barn" : "Medl")}</small>
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
                  className={`icon-button${uploadingMemberId === member.id ? " icon-button--loading" : ""}`}
                  title={`Välj bild för ${member.name}`}
                >
                  {uploadingMemberId === member.id
                    ? <Loader size={16} className="spin" />
                    : <ImagePlus size={16} />}
                  <input
                    accept="image/*"
                    disabled={uploadingMemberId !== null}
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
                {(member.isChild || roles.find((r) => r.id === member.roleId)?.isChildRole) && (() => {
                  const childCals = calendars.filter((c) => c.ownerId !== member.id && c.deletedAt === null);
                  if (childCals.length === 0) return null;
                  const isOpen = openCalFilterId === member.id;
                  return (
                    <button
                      aria-label={`Kalenderåtkomst för ${member.name}`}
                      className={`icon-button${isOpen ? " icon-button--active" : ""}`}
                      onClick={(e) => {
                        if (isOpen) {
                          setOpenCalFilterId(null);
                        } else {
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                          setCalFilterPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
                          setOpenCalFilterId(member.id);
                        }
                      }}
                      title={`Kalenderåtkomst för ${member.name}`}
                      type="button"
                    >
                      <Filter size={16} />
                    </button>
                  );
                })()}
                <button
                  aria-label={`Radera ${member.name}`}
                  className="icon-button danger"
                  disabled={member.id === currentMember.id}
                  onClick={() => onDeleteMember(member.id)}
                  title={
                    member.id === currentMember.id
                      ? "Du kan inte radera dig själv här"
                      : "Flytta till papperskorg"
                  }
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManageMembers && (
        <div className="settings-sub">
          <h3 className="settings-sub-title">Kalendervisning</h3>
          <label className="field-label toggle-label">
            <span>Visa veckornummer</span>
            <input
              type="checkbox"
              checked={calSettings.showWeekNumbers}
              onChange={(e) => onUpdateCalendarSettings({ ...calSettings, showWeekNumbers: e.target.checked })}
            />
          </label>
          <label className="field-label toggle-label">
            <span>Markera helgdagar</span>
            <input
              type="checkbox"
              checked={calSettings.showHolidays}
              onChange={(e) => onUpdateCalendarSettings({ ...calSettings, showHolidays: e.target.checked })}
            />
          </label>
          {calSettings.showHolidays && (
            <div className="holiday-color-row">
              <label className="field-label" style={{ flex: 1 }}>
                Bakgrundsfärg
                <label className="member-color-picker" style={{ background: calSettings.holidayBgColor }}>
                  <input
                    hidden
                    type="color"
                    value={calSettings.holidayBgColor}
                    onChange={(e) => onUpdateCalendarSettings({ ...calSettings, holidayBgColor: e.target.value })}
                  />
                </label>
              </label>
              <label className="field-label" style={{ flex: 1 }}>
                Textfärg
                <label className="member-color-picker" style={{ background: calSettings.holidayTextColor }}>
                  <input
                    hidden
                    type="color"
                    value={calSettings.holidayTextColor}
                    onChange={(e) => onUpdateCalendarSettings({ ...calSettings, holidayTextColor: e.target.value })}
                  />
                </label>
              </label>
            </div>
          )}
          <label className="field-label">
            Prenumerationslänk (webcal)
            <input
              className="text-input"
              type="url"
              placeholder="webcal://…"
              value={calSettings.subscriptionUrl ?? ""}
              onChange={(e) => onUpdateCalendarSettings({ ...calSettings, subscriptionUrl: e.target.value || null })}
            />
          </label>
        </div>
      )}

      <div className="settings-sub">
        <h3 className="settings-sub-title">Min data</h3>
        <p className="settings-sub-desc">
          Tar bort profilbild och flyttar egna todos, kalendrar och inköpslistor till raderat läge.
        </p>
        <button
          className={`secondary-button danger-action${confirmOwnDataDelete ? " confirming" : ""}`}
          onClick={deleteOwnData}
          type="button"
        >
          <Eraser size={16} />
          {confirmOwnDataDelete ? "Bekräfta radering" : "Radera min data"}
        </button>
      </div>

      {/* Calendar filter dropdown portal — renders outside the clipping SettingsSection */}
      {openCalFilterId && (() => {
        const m = activeMembers.find((am) => am.id === openCalFilterId);
        if (!m) return null;
        const childCals = calendars.filter((c) => c.ownerId !== m.id && c.deletedAt === null);
        return createPortal(
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 9998 }}
              onClick={() => setOpenCalFilterId(null)}
            />
            <div
              className="cal-filter-dropdown"
              style={{ position: "absolute", top: calFilterPos.top, left: calFilterPos.left, zIndex: 9999 }}
            >
              {childCals.map((cal) => (
                <label className="cal-filter-item" key={cal.id}>
                  <input
                    type="checkbox"
                    checked={canViewResource(m, cal)}
                    onChange={(e) => {
                      if (e.target.checked) onShareCalendar(cal.id, m.id, "view");
                      else onRemoveCalendarShare(cal.id, m.id);
                    }}
                  />
                  <span className="cal-filter-dot" style={{ background: cal.color }} />
                  <span>{cal.name}</span>
                </label>
              ))}
            </div>
          </>,
          document.body
        );
      })()}
    </>
  );
}

