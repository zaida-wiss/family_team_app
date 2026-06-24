import { AccountSettings } from "../accounts/AccountSettings";
import { AccountSetup } from "../accounts/AccountSetup";
import { DeleteAccountSection } from "../accounts/DeleteAccountSection";
import { InviteForm } from "../invitations/InviteForm";
import { RoleEditor } from "../roles/RoleEditor";
import { TrashView } from "../trash/TrashView";
import { hasPermission } from "../../utils/permissions";
import type { Account, CalendarSettings, Calendar, Member, PermissionKey, Role, ShoppingList, Todo } from "@shared/types";

type Props = {
  account: Account;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  calendars: Calendar[];
  shoppingLists: ShoppingList[];
  canManageRoles: boolean;
  canViewTrash: boolean;
  onUpdateAccount: (account: Account) => void;
  onUpdateCalendarSettings: (settings: CalendarSettings) => void;
  onCreateMember: (member: Member) => void;
  onDeleteMember: (memberId: string) => void;
  onDeleteOwnData: () => void;
  onUpdateMemberAvatar: (memberId: string, avatarUrl: string | null) => void;
  onUpdateMemberColor: (memberId: string, color: string | null) => void;
  onShareCalendar: (calendarId: string, memberId: string, access: "view" | "edit") => void;
  onRemoveCalendarShare: (calendarId: string, memberId: string) => void;
  onCreateTodo: (todo: Todo) => void;
  onUpdateTodo: (todoId: string, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onAssignRole: (memberId: string, roleId: string) => void;
  onCreateRole: (role: Role) => void;
  onTogglePermission: (roleId: string, key: PermissionKey) => void;
  onRestoreCalendar: (calendarId: string) => void;
  onRestoreMember: (memberId: string) => void;
  onRestoreShoppingList: (listId: string) => void;
  onRestoreTodo: (todoId: string) => void;
  onDeleteAccount: () => Promise<void>;
};

export function SettingsPanel({
  account,
  currentMember,
  members,
  roles,
  todos,
  calendars,
  shoppingLists,
  canManageRoles,
  canViewTrash,
  onUpdateAccount,
  onUpdateCalendarSettings,
  onCreateMember,
  onDeleteMember,
  onDeleteOwnData,
  onUpdateMemberAvatar,
  onUpdateMemberColor,
  onShareCalendar,
  onRemoveCalendarShare,
  onAssignRole,
  onCreateRole,
  onTogglePermission,
  onRestoreCalendar,
  onRestoreMember,
  onRestoreShoppingList,
  onRestoreTodo,
  onDeleteAccount
}: Props) {
  const canManageMembers = hasPermission(currentMember, roles, "canManageMembers");

  return (
    <>
      <AccountSetup account={account} onUpdateAccount={onUpdateAccount} />
      <AccountSettings
        account={account}
        currentMember={currentMember}
        members={members}
        roles={roles}
        calendars={calendars}
        onCreateMember={onCreateMember}
        onDeleteMember={onDeleteMember}
        onDeleteOwnData={onDeleteOwnData}
        onUpdateMemberAvatar={onUpdateMemberAvatar}
        onUpdateMemberColor={onUpdateMemberColor}
        onUpdateCalendarSettings={onUpdateCalendarSettings}
        onShareCalendar={onShareCalendar}
        onRemoveCalendarShare={onRemoveCalendarShare}
      />
      {canManageMembers && (
        <InviteForm
          accountId={account.id}
          roles={roles}
        />
      )}
      {canManageRoles && (
        <RoleEditor
          members={members}
          roles={roles}
          onAssignRole={onAssignRole}
          onCreateRole={onCreateRole}
          onTogglePermission={onTogglePermission}
        />
      )}
      {canViewTrash && (
        <TrashView
          calendars={calendars}
          currentMember={currentMember}
          members={members}
          roles={roles}
          shoppingLists={shoppingLists}
          todos={todos}
          onRestoreCalendar={onRestoreCalendar}
          onRestoreMember={onRestoreMember}
          onRestoreShoppingList={onRestoreShoppingList}
          onRestoreTodo={onRestoreTodo}
        />
      )}
      {canManageMembers && (
        <DeleteAccountSection
          accountId={account.id}
          accountName={account.name}
          onConfirm={onDeleteAccount}
        />
      )}
    </>
  );
}
