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
  | { screen: "shell"; activeMembership: Membership; onLogout: () => Promise<void>; onSwitchAccount: () => void };

export function useAppNavigation(): Screen {
  const { state: authState, login, childLogin, register, logout, updateMemberships, updateUser, applySession } = useAuth();
  const [activeMembership, setActiveMembership] = useState<Membership | null>(null);

  const inviteToken = window.location.pathname.match(/^\/invite\/([^/]+)/)?.[1] ?? null;
  const resetToken = window.location.pathname.match(/^\/reset-password\/([^/]+)/)?.[1] ?? null;

  useEffect(() => {
    if (authState.status !== "authenticated" || activeMembership) return;
    const m =
      authState.memberships.find((membership) => membership.member.id === authState.user.lastActiveMemberId) ??
      (authState.memberships.length === 1 ? authState.memberships[0] : null);
    if (!m) return;
    setActiveMembership(m);
    setApiMemberId(m.member.id);
  }, [authState, activeMembership]);

  function selectMembership(m: Membership) {
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
    onLogout: handleLogout,
    onSwitchAccount: () => setActiveMembership(null)
  };
}
