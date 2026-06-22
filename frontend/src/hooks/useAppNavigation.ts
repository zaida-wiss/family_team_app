import { useEffect, useState } from "react";
import { setAccessToken, setApiMemberId } from "../api";
import { useAuth } from "../features/auth/useAuth";
import type { AcceptedSession } from "../features/invitations/AcceptInvitePage";
import type { Membership, User } from "@shared/types";

type Screen =
  | { screen: "loading" }
  | { screen: "invite"; token: string; onAccepted: (s: AcceptedSession) => void }
  | { screen: "auth"; onLogin: ReturnType<typeof useAuth>["login"]; onRegister: ReturnType<typeof useAuth>["register"] }
  | { screen: "picker"; user: User; memberships: Membership[]; onSelect: (m: Membership) => void; onLogout: () => void; onMembershipsUpdated: (ms: Membership[]) => void }
  | { screen: "shell"; activeMembership: Membership; onLogout: () => Promise<void>; onSwitchAccount: () => void };

export function useAppNavigation(): Screen {
  const { state: authState, login, register, logout, updateMemberships, applySession } = useAuth();
  const [activeMembership, setActiveMembership] = useState<Membership | null>(null);

  const inviteToken = window.location.pathname.match(/^\/invite\/([^/]+)/)?.[1] ?? null;

  useEffect(() => {
    if (authState.status !== "authenticated" || activeMembership) return;
    if (authState.memberships.length !== 1) return;
    const m = authState.memberships[0];
    setActiveMembership(m);
    setApiMemberId(m.member.id);
  }, [authState, activeMembership]);

  function selectMembership(m: Membership) {
    setActiveMembership(m);
    setApiMemberId(m.member.id);
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

  if (authState.status === "unauthenticated") {
    return { screen: "auth", onLogin: login, onRegister: register };
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
