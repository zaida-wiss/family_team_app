import { useEffect, useState } from "react";
import { membersApi } from "../../api";
import { readCache, writeCache } from "../../utils/localCache";
import type {
  AppPanel,
  CalendarFilterKey,
  CalendarViewMode,
  ChildTimelineSettings,
  DashboardThemeId,
  Id,
  Member,
  TodoThreadRange,
  TodoViewMode
} from "@shared/types";

const MEMBERS_CACHE_KEY = "members_v1";

export function useMembersState() {
  // Stale-while-revalidate + realtidssynk (2026-07-17, Zaidas fynd: "dagens
  // stjärnor och framförallt totalt antal stjärnor i barnvyn uppdateras inte
  // direkt, jag behöver refresha sidan... vi vill helt jobba i realtid").
  // Medlemmar hämtades tidigare bara EN gång vid appstart — en stjärnökning
  // (todo godkänd, belöning köpt) syntes aldrig förrän en manuell omladdning.
  // Nu: cachad data visas direkt (funkar även utan nät), och en SSE-
  // prenumeration (membersApi.subscribeToChanges) triggar en ny hämtning så
  // fort servern faktiskt ändrat något — samma mönster som todos redan har.
  const [members, setMembers] = useState<Member[]>(() => readCache(MEMBERS_CACHE_KEY, []));

  useEffect(() => {
    membersApi.getAll().then(setMembers).catch(console.error);
  }, []);

  useEffect(() => {
    return membersApi.subscribeToChanges(() => {
      membersApi.getAll().then(setMembers).catch(console.error);
    });
  }, []);

  useEffect(() => {
    writeCache(MEMBERS_CACHE_KEY, members);
  }, [members]);

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

  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  // Väntar in svaret (till skillnad från övriga fire-and-forget-funktioner
  // ovan) så TrashView.tsx kan visa ett fel om anropet misslyckas.
  async function purgeMembersTrash() {
    await membersApi.purgeTrash();
    setMembers((current) => current.filter((member) => member.deletedAt === null));
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

  // Mörkt läge (2026-07-23) — oberoende på/av-växel ovanpå dashboardTheme,
  // samma optimistiska mönster.
  function updateMemberDarkMode(memberId: Id, darkMode: boolean) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) {
          return member;
        }

        membersApi.update(memberId, { darkMode }).catch(console.error);
        return { ...member, darkMode };
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

  function updateMemberName(memberId: Id, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member;
        membersApi.update(memberId, { name: trimmed }).catch(console.error);
        return { ...member, name: trimmed };
      })
    );
  }

  // Barn-inloggning (2026-07-22) — till skillnad från övriga update*-funktioner
  // ovan (fire-and-forget, optimistisk) väntar den här in svaret och kastar
  // fel vidare, eftersom UI:t (AccountSettings.tsx) behöver visa ett
  // felmeddelande direkt (t.ex. "användarnamnet är redan taget") istället för
  // att bara logga tyst. member.userId sätts lokalt så knappen byter text
  // från "Skapa inloggning" till "Ändra inloggning" utan en full omladdning.
  async function setChildCredentials(memberId: Id, username: string, password: string) {
    const result = await membersApi.setCredentials(memberId, username, password);
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId && !member.userId ? { ...member, userId: result.id } : member
      )
    );
    return result;
  }

  function updateCalendarFilterSettings(
    memberId: Id,
    filterKey: CalendarFilterKey,
    visibleCalendarIds: Id[]
  ) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member;
        const calendarFilterSettings = {
          ...(member.calendarFilterSettings ?? {}),
          [filterKey]: { visibleCalendarIds }
        };
        membersApi.update(memberId, { calendarFilterSettings }).catch(console.error);
        return { ...member, calendarFilterSettings };
      })
    );
  }

  function updateChildTimelineSettings(memberId: Id, childTimelineSettings: ChildTimelineSettings) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member;
        membersApi.update(memberId, { childTimelineSettings }).catch(console.error);
        return { ...member, childTimelineSettings };
      })
    );
  }

  function updateMemberNavigation(
    memberId: Id,
    patch: {
      lastActivePanel?: AppPanel;
      lastSelectedDashboardMemberId?: Id | null;
      calendarView?: CalendarViewMode;
      todoViewMode?: TodoViewMode;
      todoThreadOrder?: Id[];
      todoThreadRange?: TodoThreadRange;
    }
  ) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member;
        membersApi.update(memberId, patch).catch(console.error);
        return { ...member, ...patch };
      })
    );
  }

  return {
    members,
    createMember,
    softDeleteMember,
    restoreMember,
    purgeMembersTrash,
    updateMemberTheme,
    updateMemberDarkMode,
    updateMemberAvatar,
    updateMemberColor,
    updateMemberName,
    updateCalendarFilterSettings,
    updateChildTimelineSettings,
    updateMemberNavigation,
    assignRole,
    clearMemberAvatar,
    setChildCredentials
  };
}
