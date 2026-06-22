import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { invitationsApi } from "../../api";
import type { Role } from "@shared/types";

type Props = {
  accountId: string;
  roles: Role[];
};

export function InviteForm({ accountId, roles }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email.trim() || !name.trim() || !roleId) return;
    setError(null);
    setLoading(true);
    try {
      const result = await invitationsApi.invite(accountId, {
        invitedEmail: email.trim(),
        memberName: name.trim(),
        roleId
      });
      setInviteUrl(result.inviteUrl);
      setEmail("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="invite-form" aria-label="Bjud in">
      <h3>Bjud in</h3>

      {inviteUrl ? (
        <div className="invite-result">
          <p className="invite-success">Inbjudan skapad! Dela länken med {name || "personen"}.</p>
          <div className="invite-url-row">
            <code className="invite-url">{inviteUrl}</code>
            <button
              className="icon-button"
              onClick={copy}
              title="Kopiera länk"
              type="button"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <button
            className="secondary-button"
            onClick={() => { setInviteUrl(null); setName(""); setCopied(false); }}
            type="button"
          >
            Bjud in fler
          </button>
        </div>
      ) : (
        <div className="invite-fields">
          <label className="field-label">
            E-postadress (till den som bjuds in)
            <input
              className="text-input"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="namn@exempel.se"
              type="email"
              value={email}
            />
          </label>

          <label className="field-label">
            Namn i kontot
            <input
              className="text-input"
              onChange={(e) => setName(e.target.value)}
              placeholder="Förnamn Efternamn"
              type="text"
              value={name}
            />
          </label>

          <label className="field-label">
            Roll
            <select
              className="text-input"
              onChange={(e) => setRoleId(e.target.value)}
              value={roleId}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button
            className="primary-button"
            disabled={loading || !email.trim() || !name.trim() || !roleId}
            onClick={send}
            type="button"
          >
            {loading ? "…" : "Skapa inbjudningslänk"}
          </button>
        </div>
      )}
    </section>
  );
}
