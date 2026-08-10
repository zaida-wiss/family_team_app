import { useEffect, useState } from "react";
import { authApi, setAccessToken, setApiMemberId } from "../api";
import { useAuth } from "../features/auth/useAuth";
import type { AcceptedSession } from "../features/invitations/AcceptInvitePage";
import type { Membership, User } from "@shared/types";

type Screen =
  | { screen: "loading" }
  | { screen: "offline" }
  | { screen: "invite"; token: string; onAccepted: (s: AcceptedSession) => void }
  | {
      screen: "auth";
      onLogin: ReturnType<typeof useAuth>["login"];
      onChildLogin: ReturnType<typeof useAuth>["childLogin"];
      onRegister: ReturnType<typeof useAuth>["register"];
      resetToken?: string;
    }
  | { screen: "picker"; user: User; memberships: Membership[]; onSelect: (m: Membership) => void; onLogout: () => void; onMembershipsUpdated: (ms: Membership[]) => void }
  | {
      screen: "shell";
      activeMembership: Membership;
      memberships: Membership[];
      user: User;
      onLogout: () => Promise<void>;
      onSwitchAccount: () => void;
      onSelectMembership: (m: Membership) => void;
      onMembershipsUpdated: (ms: Membership[]) => void;
      onUpdateMyAvatar: (avatarUrl: string | null) => Promise<void>;
    };

export function useAppNavigation(): Screen {
  const { state: authState, login, childLogin, register, logout, updateMemberships, updateUser, applySession } = useAuth();
  const [activeMembership, setActiveMembership] = useState<Membership | null>(null);
  // Bugg fixad (2026-07-31, upptäckt när "Byt vy"-knappen blev den ENDA
  // vägen att byta mellan "Mina familjekonton" — se HeroBar.tsx/onSwitchAccount
  // — efter att Hem-vyns gamla, casuala sessionsväxlande dropdown togs bort):
  // auto-återställningseffekten nedan körde om varje gång activeMembership
  // blev null, inklusive ett MEDVETET onSwitchAccount-klick — och hittade
  // omedelbart samma konto igen via lastActiveMemberId (som fortfarande
  // pekade på den man just klickade bort från), vilket gjorde att
  // kontoväljaren aldrig faktiskt visades. switchingAccount skiljer ett
  // AVSIKTLIGT byte (kontoväljaren ska visas och STANNA kvar tills ett
  // aktivt val görs) från den vanliga sessions-återställningen vid en
  // sidomladdning/första inloggning.
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const inviteToken = window.location.pathname.match(/^\/invite\/([^/]+)/)?.[1] ?? null;
  const resetToken = window.location.pathname.match(/^\/reset-password\/([^/]+)/)?.[1] ?? null;

  useEffect(() => {
    if (authState.status !== "authenticated" || activeMembership || switchingAccount) return;
    const m =
      authState.memberships.find((membership) => membership.member.id === authState.user.lastActiveMemberId) ??
      (authState.memberships.length === 1 ? authState.memberships[0] : null);
    if (!m) return;
    setActiveMembership(m);
    setApiMemberId(m.member.id);
  }, [authState, activeMembership, switchingAccount]);

  function selectMembership(m: Membership) {
    setSwitchingAccount(false);
    setActiveMembership(m);
    setApiMemberId(m.member.id);
    authApi
      .updatePreferences({ lastActiveMemberId: m.member.id })
      .then(({ user }) => updateUser(user))
      .catch(console.error);
  }

  async function handleLogout() {
    await logout();
    setActiveMembership(null);
  }

  async function handleUpdateMyAvatar(avatarUrl: string | null) {
    const { user } = await authApi.updateMyAvatar(avatarUrl);
    updateUser(user);
  }

  function handleInviteAccepted(session: AcceptedSession) {
    setAccessToken(session.accessToken);
    applySession(session.user, session.memberships, session.accessToken);
    window.history.pushState({}, "", "/");
  }

  if (inviteToken) {
    return { screen: "invite", token: inviteToken, onAccepted: handleInviteAccepted };
  }

  if (authState.status === "loading") {
    return { screen: "loading" };
  }

  if (authState.status === "offline") {
    return { screen: "offline" };
  }

  if (authState.status === "unauthenticated") {
    return {
      screen: "auth",
      onLogin: login,
      onChildLogin: childLogin,
      onRegister: register,
      resetToken: resetToken ?? undefined
    };
  }

  const { user, memberships } = authState;

  if (!activeMembership) {
    return {
      screen: "picker",
      user,
      memberships,
      onSelect: selectMembership,
      onLogout: logout,
      onMembershipsUpdated: updateMemberships
    };
  }

  return {
    screen: "shell",
    activeMembership,
    memberships,
    user,
    onLogout: handleLogout,
    onSwitchAccount: () => {
      setSwitchingAccount(true);
      setActiveMembership(null);
    },
    onSelectMembership: selectMembership,
    onMembershipsUpdated: updateMemberships,
    onUpdateMyAvatar: handleUpdateMyAvatar
  };
}
