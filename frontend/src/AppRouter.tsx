import { AuthPage } from "./features/auth/AuthPage";
import { AccountPicker } from "./features/auth/AccountPicker";
import { AcceptInvitePage } from "./features/invitations/AcceptInvitePage";
import { Shell } from "./features/layout/Shell";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { setCacheNamespace } from "./utils/localCache";

export function AppRouter() {
  const nav = useAppNavigation();

  if (nav.screen === "loading") {
    return <main className="app-shell"><p style={{ padding: "2rem" }}>Laddar…</p></main>;
  }
  if (nav.screen === "offline") {
    return (
      <main className="app-shell">
        <p style={{ padding: "2rem" }}>
          Ingen internetanslutning just nu — försöker igen automatiskt så fort uppkopplingen är tillbaka.
        </p>
      </main>
    );
  }
  if (nav.screen === "invite") {
    return <AcceptInvitePage token={nav.token} onAccepted={nav.onAccepted} />;
  }
  if (nav.screen === "auth") {
    return (
      <AuthPage
        onLogin={nav.onLogin}
        onChildLogin={nav.onChildLogin}
        onRegister={nav.onRegister}
        resetToken={nav.resetToken}
      />
    );
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
  // Kontoscopad local-storage-cache (2026-07-30) — måste sättas SYNKRONT
  // här, i render-funktionen (inte en effekt), så namnrymden hinner bytas
  // INNAN Shell-trädets barn nedan monteras och läser sin egen cache. Se
  // localCache.ts:s kommentar för hela resonemanget.
  setCacheNamespace(nav.activeMembership.member.accountId ?? "");

  return (
    <Shell
      // 2026-07-29, Zaidas fynd: "när jag växlar i hemvyn till en annan
      // familj så kommer jag inte tillbaka till min primära familj" —
      // Shell fick tidigare ingen key, så ett familjebyte (activeMembership
      // ändras) bara skickade nya props in i SAMMA komponentinstans.
      // useAccountState/useAppState:s useState(initial)-hooks respekterar
      // bara sitt initial-värde vid FÖRSTA mount — activeAccount frös
      // därför permanent på den familj som var aktiv när Shell först
      // monterades (oftast den primära), oavsett hur många gånger man bytte
      // familj efteråt. Eftersom otherFamilies-filtret (useShellState.ts)
      // jämför mot detta frusna activeAccount.id, exkluderades den
      // ursprungliga familjen permanent ur "andra familjer"-listan i
      // dropdownen — man kunde alltså aldrig växla TILLBAKA. En key tvingar
      // fram en full remount vid varje familjebyte (samma "behöver
      // nollställas helt"-mönster som ErrorBoundary key={activePanel} redan
      // använder), så alla per-konto-hookar startar om med rätt initialvärde.
      key={nav.activeMembership.member.id}
      activeMembership={nav.activeMembership}
      memberships={nav.memberships}
      onLogout={nav.onLogout}
      onSwitchAccount={nav.onSwitchAccount}
      onSelectMembership={nav.onSelectMembership}
      onMembershipsUpdated={nav.onMembershipsUpdated}
    />
  );
}
