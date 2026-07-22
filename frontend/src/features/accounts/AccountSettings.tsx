import "./AccountSettings.css";
import { Eraser, Pencil } from "lucide-react";
import { useState } from "react";
import { MemberAvatar } from "../../components/MemberAvatar";
import { MemberEditModal } from "./MemberEditModal";
import { hasPermission } from "../../utils/permissions";
import { generateId } from "../../utils/uuid";
import type { AccessLevel, Account, Calendar, CalendarSettings, Id, Member, Role } from "@shared/types";

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
  onUpdateMemberName: (memberId: string, name: string) => void;
  onSetChildCredentials: (memberId: string, username: string, password: string) => Promise<{ id: string; username: string }>;
  onUpdateCalendarSettings: (settings: CalendarSettings) => void;
  onUpdateFixedTodoTimes: (fixedTodoTimes: boolean) => void;
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
  onUpdateMemberName,
  onSetChildCredentials,
  onUpdateCalendarSettings,
  onUpdateFixedTodoTimes,
  onShareCalendar,
  onRemoveCalendarShare,
}: AccountSettingsProps) {
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [confirmOwnDataDelete, setConfirmOwnDataDelete] = useState(false);
  // Redigera-medlem-modal (2026-07-22) — se MemberEditModal.tsx. Ersätter den
  // tidigare raden separata ikon-knappar (färg/bild/inloggning/kalender/
  // radera) per medlemsrad med EN pennikon som öppnar en modal med alla val.
  const [editingMemberId, setEditingMemberId] = useState<Id | null>(null);

  const canManageMembers = hasPermission(currentMember, roles, "canManageMembers");
  const calSettings: CalendarSettings = account.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS;

  function createMember() {
    const trimmedName = name.trim();
    if (!trimmedName || !roleId || !canManageMembers) return;
    const selectedRole = roles.find((r) => r.id === roleId);
    const isChild = selectedRole?.isChildRole ?? false;
    onCreateMember({
      id: `member-${generateId()}`,
      accountId: account.id,
      userId: null,
      name: trimmedName,
      roleId,
      isChild,
      avatarUrl: null,
      color: null,
      dashboardTheme: isChild ? "space" : "clear",
      spentStars: 0,
      approvedStars: 0,
      deletedAt: null,
      deletedBy: null
    });
    setName("");
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
                <button
                  aria-label={`Redigera ${member.name}`}
                  className="icon-button"
                  onClick={() => setEditingMemberId(member.id)}
                  title="Redigera"
                  type="button"
                >
                  <Pencil size={16} />
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

      {canManageMembers && (
        <div className="settings-sub">
          <h3 className="settings-sub-title">Klockslag på todos/rutiner</h3>
          <label className="field-label toggle-label">
            <span>Fast klockslag oavsett var enheten befinner sig</span>
            <input
              type="checkbox"
              checked={account.fixedTodoTimes ?? false}
              onChange={(e) => onUpdateFixedTodoTimes(e.target.checked)}
            />
          </label>
          <p className="settings-sub-desc">
            {account.fixedTodoTimes
              ? "På: ett klockslag (t.ex. 10:00) förblir alltid detsamma, oavsett var enheten befinner sig."
              : "Av: ett klockslag (t.ex. 10:00) visas i enhetens egen tidszon — reser familjen till ett annat land kan tiden visas en eller flera timmar fel."}
          </p>
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

      {editingMemberId && (() => {
        const editingMember = activeMembers.find((m) => m.id === editingMemberId);
        if (!editingMember) return null;
        return (
          <MemberEditModal
            calendars={calendars}
            currentMember={currentMember}
            member={editingMember}
            onClose={() => setEditingMemberId(null)}
            onDelete={(memberId) => {
              onDeleteMember(memberId);
              setEditingMemberId(null);
            }}
            onRemoveCalendarShare={onRemoveCalendarShare}
            onSetChildCredentials={onSetChildCredentials}
            onShareCalendar={onShareCalendar}
            onUpdateAvatar={onUpdateMemberAvatar}
            onUpdateColor={onUpdateMemberColor}
            onUpdateName={onUpdateMemberName}
            roles={roles}
          />
        );
      })()}
    </>
  );
}

