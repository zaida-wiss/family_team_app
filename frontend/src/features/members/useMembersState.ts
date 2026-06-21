import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { members as initialMembers } from "../../data/sampleData";
import type { DashboardThemeId, Id, Member } from "@shared/types";

export function useMembersState() {
  const [members, setMembers] = useLocalStorageState<Member[]>(
    "family-team-app:members",
    initialMembers
  );

  function createMember(member: Member) {
    setMembers((current) => [...current, member]);
  }

  function softDeleteMember(memberId: Id, deletedBy: Id) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId || member.id === deletedBy) {
          return member;
        }

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

        return { ...member, roleId };
      })
    );
  }

  function clearMemberAvatar(memberId: Id) {
    updateMemberAvatar(memberId, null);
  }

  return {
    members,
    createMember,
    softDeleteMember,
    restoreMember,
    updateMemberTheme,
    updateMemberAvatar,
    assignRole,
    clearMemberAvatar
  };
}
