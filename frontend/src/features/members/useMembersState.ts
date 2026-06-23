import { useEffect, useState } from "react";
import { membersApi } from "../../api";
import type { DashboardThemeId, Id, Member } from "@shared/types";

export function useMembersState() {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    membersApi.getAll().then(setMembers).catch(console.error);
  }, []);

  function createMember(member: Member) {
    membersApi.create(member).catch(console.error);
    setMembers((current) => [...current, member]);
  }

  function softDeleteMember(memberId: Id, deletedBy: Id) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId || member.id === deletedBy) {
          return member;
        }

        membersApi.remove(memberId).catch(console.error);
        return {
          ...member,
          deletedAt: new Date().toISOString(),
          deletedBy
        };
      })
    );
  }

  function restoreMember(memberId: Id) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member;
        }

        membersApi.restore(memberId).catch(console.error);
        return { ...member, deletedAt: null, deletedBy: null };
      })
    );
  }

  function updateMemberTheme(memberId: Id, dashboardTheme: DashboardThemeId) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member;
        }

        membersApi.update(memberId, { dashboardTheme }).catch(console.error);
        return { ...member, dashboardTheme };
      })
    );
  }

  function updateMemberAvatar(memberId: Id, avatarUrl: string | null) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member;
        }

        membersApi.update(memberId, { avatarUrl }).catch(console.error);
        return { ...member, avatarUrl };
      })
    );
  }

  function assignRole(memberId: Id, roleId: Id) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member;
        }

        membersApi.update(memberId, { roleId }).catch(console.error);
        return { ...member, roleId };
      })
    );
  }

  function clearMemberAvatar(memberId: Id) {
    updateMemberAvatar(memberId, null);
  }

  function updateMemberColor(memberId: Id, color: string | null) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member;
        membersApi.update(memberId, { color }).catch(console.error);
        return { ...member, color };
      })
    );
  }

  return {
    members,
    createMember,
    softDeleteMember,
    restoreMember,
    updateMemberTheme,
    updateMemberAvatar,
    updateMemberColor,
    assignRole,
    clearMemberAvatar
  };
}
