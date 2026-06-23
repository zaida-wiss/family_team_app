import { AuthPage } from "./features/auth/AuthPage";
import { AccountPicker } from "./features/auth/AccountPicker";
import { AcceptInvitePage } from "./features/invitations/AcceptInvitePage";
import { Shell } from "./features/layout/Shell";
import { useAppNavigation } from "./hooks/useAppNavigation";

export function AppRouter() {
  const nav = useAppNavigation();

  if (nav.screen === "loading") {
    return <main className="app-shell"><p style={{ padding: "2rem" }}>Laddar…</p></main>;
  }
  if (nav.screen === "invite") {
    return <AcceptInvitePage token={nav.token} onAccepted={nav.onAccepted} />;
  }
  if (nav.screen === "auth") {
    return <AuthPage onLogin={nav.onLogin} onRegister={nav.onRegister} resetToken={nav.resetToken} />;
  }
  if (nav.screen === "picker") {
    return (
      <AccountPicker
        user={nav.user}
        memberships={nav.memberships}
        onSelect={nav.onSelect}
        onLogout={nav.onLogout}
        onMembershipsUpdated={nav.onMembershipsUpdated}
      />
    );
  }
  return (
    <Shell
      activeMembership={nav.activeMembership}
      onLogout={nav.onLogout}
      onSwitchAccount={nav.onSwitchAccount}
    />
  );
}
