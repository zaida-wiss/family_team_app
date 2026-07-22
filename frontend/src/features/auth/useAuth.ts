import { useState, useEffect, useCallback, useRef } from "react";
import {
  authApi,
  setAccessToken,
  setApiMemberId,
  setRefreshSessionHandler,
  setUnauthorizedHandler
} from "../../api";
import type { Membership, User } from "@shared/types";
import { trackEvent } from "../../utils/analytics";

type AuthState =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: User; memberships: Membership[] };

// performRequest (api/client.ts) kastar exakt detta meddelande när fetch()
// själv misslyckas (inget nät) — skiljer det från ett äkta 401 (ogiltig/
// utgången refresh-cookie), som kastar "Inte autentiserad" istället.
const NETWORK_ERROR_MESSAGE = "Servern är inte nåbar";

function isNetworkError(error: unknown): boolean {
  return error instanceof Error && error.message === NETWORK_ERROR_MESSAGE;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const isOfflineRef = useRef(false);

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
    setRefreshSessionHandler(async () => {
      const { accessToken, user, memberships } = await authApi.refresh();
      applySession(user, memberships ?? [], accessToken);
    });

    // Ett nätverksfel (ingen uppkoppling) vid appstart ska INTE logga ut —
    // det betyder bara att vi inte hann fråga servern än, inte att sessionen
    // är ogiltig. Fixat 2026-07-16 (Zaidas fynd, dåligt nät i Finland): innan
    // detta tolkades ETT MISSLYCKAT FÖRSÖK AV VILKEN ANLEDNING SOM HELST som
    // "inte inloggad", vilket visade inloggningsformuläret och gjorde HELA
    // appen (barnens uppgifter, kalendrar, todos, Rekord-vyn) otillgänglig
    // trots att den befintliga sessionen fortfarande var giltig — så fort
    // nätet svarade lite för sent. Ett äkta 401 (ogiltig/utgången
    // refresh-cookie) loggar fortsatt ut, oförändrat.
    function attemptRefresh() {
      authApi
        .refresh()
        .then(({ accessToken, user, memberships }) => {
          isOfflineRef.current = false;
          applySession(user, memberships ?? [], accessToken);
        })
        .catch((error) => {
          const offline = isNetworkError(error);
          isOfflineRef.current = offline;
          setState(offline ? { status: "offline" } : { status: "unauthenticated" });
        });
    }

    attemptRefresh();

    function handleOnline() {
      if (isOfflineRef.current) attemptRefresh();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") handleOnline();
    }
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [applySession, clearSession]);

  async function login(email: string, password: string) {
    const { accessToken, user, memberships } = await authApi.login(email, password);
    applySession(user, memberships ?? [], accessToken);
    trackEvent("login");
  }

  async function childLogin(parentEmail: string, username: string, password: string) {
    const { accessToken, user, memberships } = await authApi.childLogin(parentEmail, username, password);
    applySession(user, memberships ?? [], accessToken);
    trackEvent("login");
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

  function updateUser(user: User) {
    setState((prev) =>
      prev.status === "authenticated" ? { ...prev, user } : prev
    );
  }

  return { state, login, childLogin, register, logout, updateMemberships, updateUser, applySession };
}
