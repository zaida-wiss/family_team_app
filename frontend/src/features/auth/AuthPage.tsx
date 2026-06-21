import { useState } from "react";

type Mode = "login" | "register";

type Props = {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, name: string) => Promise<void>;
};

export function AuthPage({ onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(email, password, name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">BMAD</h1>
        <p className="eyebrow">{mode === "login" ? "Logga in" : "Skapa konto"}</p>

        <form className="auth-form" onSubmit={handleSubmit}>
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
              autoComplete={mode === "login" ? "email" : "new-email"}
              className="text-input"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
              required
              type="email"
              value={email}
            />
          </label>

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

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "…" : mode === "login" ? "Logga in" : "Skapa konto"}
          </button>
        </form>

        <button
          className="auth-switch"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
          type="button"
        >
          {mode === "login" ? "Inget konto? Registrera dig" : "Har du redan ett konto? Logga in"}
        </button>
      </div>
    </main>
  );
}
