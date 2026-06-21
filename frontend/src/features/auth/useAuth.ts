import { useState, useEffect, useCallback } from "react";
import {
  authApi,
  setAccessToken,
  setApiMemberId,
  setUnauthorizedHandler
} from "../../api";
import type { Membership, User } from "@shared/types";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: User; memberships: Membership[] };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const applySession = useCallback((user: User, memberships: Membership[], token: string) => {
    setAccessToken(token);
    setState({ status: "authenticated", user, memberships });
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setApiMemberId(null);
    setState({ status: "unauthenticated" });
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);

    authApi
      .refresh()
      .then(({ accessToken, user, memberships }) => {
        applySession(user, memberships ?? [], accessToken);
      })
      .catch(() => {
        setState({ status: "unauthenticated" });
      });
  }, [applySession, clearSession]);

  async function login(email: string, password: string) {
    const { accessToken, user, memberships } = await authApi.login(email, password);
    applySession(user, memberships ?? [], accessToken);
  }

  async function register(email: string, password: string, name: string) {
    const { accessToken, user } = await authApi.register(email, password, name);
    applySession(user, [], accessToken);
  }

  async function logout() {
    await authApi.logout().catch(() => null);
    clearSession();
  }

  function updateMemberships(memberships: Membership[]) {
    setState((prev) =>
      prev.status === "authenticated" ? { ...prev, memberships } : prev
    );
  }

  return { state, login, register, logout, updateMemberships };
}
