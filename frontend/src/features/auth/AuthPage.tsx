import { useState } from "react";
import { authApi } from "../../api";
import styles from "./Auth.module.css";

type Mode = "login" | "register" | "forgot" | "forgot-done";

type Props = {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, name: string) => Promise<void>;
  resetToken?: string;
};

export function AuthPage({ onLogin, onRegister, resetToken }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (resetToken) {
    return <ResetPasswordForm token={resetToken} />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else if (mode === "register") {
        await onRegister(email, password, name);
      } else if (mode === "forgot") {
        await authApi.forgotPassword(email);
        setMode("forgot-done");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "forgot-done") {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>BMAD</h1>
          <p className="eyebrow">Kolla din e-post</p>
          <p style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
            Om e-postadressen finns registrerad har vi skickat en återställningslänk.
          </p>
          <button className={styles.switchButton} onClick={() => setMode("login")} type="button">
            Tillbaka till inloggning
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>BMAD</h1>
        <p className="eyebrow">
          {mode === "login" ? "Logga in" : mode === "register" ? "Skapa konto" : "Återställ lösenord"}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="field-label">
              Namn
              <input
                autoComplete="name"
                className="text-input"
                onChange={(e) => setName(e.target.value)}
                placeholder="Ditt namn"
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
              placeholder="namn@exempel.se"
              required
              type="email"
              value={email}
            />
          </label>

          {mode !== "forgot" && (
            <label className="field-label">
              Lösenord
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="text-input"
                minLength={mode === "register" ? 8 : undefined}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "register" ? "Minst 8 tecken" : ""}
                required
                type="password"
                value={password}
              />
            </label>
          )}

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "…" : mode === "login" ? "Logga in" : mode === "register" ? "Skapa konto" : "Skicka återställningslänk"}
          </button>
        </form>

        {mode === "login" && (
          <button className={styles.switchButton} onClick={() => { setMode("forgot"); setError(null); }} type="button">
            Glömt lösenordet?
          </button>
        )}

        <button
          className={styles.switchButton}
          onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(null); }}
          type="button"
        >
          {mode === "register" ? "Har du redan ett konto? Logga in" : mode === "login" ? "Inget konto? Registrera dig" : "Tillbaka till inloggning"}
        </button>
      </div>
    </main>
  );
}

function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Lösenorden matchar inte"); return; }
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>BMAD</h1>
          <p className="eyebrow">Lösenord återställt</p>
          <p style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>Du kan nu logga in med ditt nya lösenord.</p>
          <button className="primary-button" onClick={() => window.history.replaceState({}, "", "/")} type="button">
            Gå till inloggning
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>BMAD</h1>
        <p className="eyebrow">Välj nytt lösenord</p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className="field-label">
            Nytt lösenord
            <input
              autoComplete="new-password"
              className="text-input"
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minst 8 tecken"
              required
              type="password"
              value={password}
            />
          </label>
          <label className="field-label">
            Bekräfta lösenord
            <input
              autoComplete="new-password"
              className="text-input"
              minLength={8}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Upprepa lösenordet"
              required
              type="password"
              value={confirm}
            />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "…" : "Spara nytt lösenord"}
          </button>
        </form>
      </div>
    </main>
  );
}
