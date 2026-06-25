import { useEffect, useState } from "react";
import { invitationsApi } from "../../api";
import authStyles from "../auth/Auth.module.css";
import inviteStyles from "./InviteForm.module.css";
import type { Account, Invitation, Membership, Role, User } from "@shared/types";

export type AcceptedSession = { accessToken: string; user: User; memberships: Membership[] };

type Mode = "login" | "register";

type InviteData = { invitation: Invitation; account: Account; role: Role };

type Props = {
  token: string;
  onAccepted: (session: AcceptedSession) => void;
};

export function AcceptInvitePage({ token, onAccepted }: Props) {
  const [data, setData] = useState<InviteData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    invitationsApi
      .get(token)
      .then((result) => {
        setData(result);
        setEmail(result.invitation.invitedEmail);
        setName(result.invitation.memberName);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Ogiltig inbjudan"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setLoading(true);
    try {
      const session = await invitationsApi.accept(
        token,
        mode === "register"
          ? { action: "register", email, password, name }
          : { action: "login", email, password }
      );
      onAccepted(session);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  if (loadError) {
    return (
      <main className={authStyles.page}>
        <div className={authStyles.card}>
          <h1 className={authStyles.title}>Ogiltig inbjudan</h1>
          <p className={authStyles.error}>{loadError}</p>
          <a href="/" className={authStyles.switchButton}>Gå till startsidan</a>
        </div>
      </main>
    );
  }

  if (!data) {
    return <main className={authStyles.page}><div className={authStyles.card}><p>Laddar inbjudan…</p></div></main>;
  }

  const { invitation, account, role } = data;

  return (
    <main className={authStyles.page}>
      <div className={authStyles.card}>
        <p className="eyebrow">Du har blivit inbjuden till</p>
        <h1 className={authStyles.title}>{account.name}</h1>
        <p style={{ margin: 0, color: "#6b8f85" }}>
          Roll: <strong>{role.name}</strong>
          {invitation.isChild ? " · Barnkonto" : ""}
        </p>

        <div className={inviteStyles.modeTabs}>
          <button
            className={`tab ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
            type="button"
          >
            Nytt konto
          </button>
          <button
            className={`tab ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
            type="button"
          >
            Logga in
          </button>
        </div>

        <form className={authStyles.form} onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="field-label">
              Namn
              <input
                className="text-input"
                onChange={(e) => setName(e.target.value)}
                required
                type="text"
                value={name}
              />
            </label>
          )}

          <label className="field-label">
            E-postadress
            <input
              autoComplete="email"
              className="text-input"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field-label">
            Lösenord
            <input
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="text-input"
              minLength={mode === "register" ? 8 : undefined}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Minst 8 tecken" : ""}
              required
              type="password"
              value={password}
            />
          </label>

          {submitError && <p className={authStyles.error} role="alert">{submitError}</p>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "…" : mode === "register" ? "Skapa konto och gå med" : "Logga in och gå med"}
          </button>
        </form>
      </div>
    </main>
  );
}
