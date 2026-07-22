import "./ChildShareSettings.css";
import { useState } from "react";
import type { FormEvent } from "react";
import { Search, X } from "lucide-react";
import { useChildShareManagement } from "../todos/useChildSharesState";
import type { AccessLevel, Id, Member } from "@shared/types";

type Props = {
  childMembers: Member[];
};

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22, Zaidas beslut: "separerade föräldrar utan god relation ändå
// skall kunna dela information om ett gemensamt barn"). Sökningen sker via
// den mottagande vuxnas e-post (samma "unik identifierare"-resonemang som
// invitationsService.ts) — mottagaren väljer själv INGENTING, det är
// UTFÄRDAREN (en vuxen med canManageMembers i BARNETS EGET konto) som
// initierar och kan återkalla. Mottagaren kan aldrig dela vidare — se
// canManageChildShares i shared/permissions.ts, en strukturell spärr, inte
// en flagga som skulle kunna missas.
export function ChildShareSettings({ childMembers }: Props) {
  const [selectedChildId, setSelectedChildId] = useState<Id>(childMembers[0]?.id ?? "");
  const { shares, candidates, loading, lookup, grant, revoke, clearCandidates } =
    useChildShareManagement(selectedChildId || null);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<AccessLevel>("view");

  if (childMembers.length === 0) return null;

  function selectChild(id: Id) {
    setSelectedChildId(id);
    clearCandidates();
    setEmail("");
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) lookup(email.trim());
  }

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">Dela barn</h3>
      <p className="settings-sub-desc">
        Ge en annan vuxen — i din egen familj eller i en helt annan familj — åtkomst till ett barns
        uppgifter. Personen kan aldrig dela vidare till någon annan.
      </p>

      {childMembers.length > 1 && (
        <select
          aria-label="Barn"
          className="wish-form-input"
          onChange={(e) => selectChild(e.target.value)}
          value={selectedChildId}
        >
          {childMembers.map((child) => (
            <option key={child.id} value={child.id}>{child.name}</option>
          ))}
        </select>
      )}

      {shares.length > 0 && (
        <ul className="child-share-list">
          {shares.map((share) => (
            <li className="child-share-list__item" key={`${share.accountId}-${share.memberId}`}>
              <span>{share.access === "edit" ? "Kan redigera" : "Kan visa"}</span>
              <button
                aria-label="Ta bort delning"
                className="icon-button danger"
                onClick={() => revoke(share)}
                type="button"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="wish-form" onSubmit={submitLookup}>
        <input
          aria-label="E-post till en vuxen"
          className="wish-form-input"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-post till en vuxen"
          type="email"
          value={email}
        />
        <button className="wish-form-btn" disabled={loading} type="submit">
          <Search size={16} /> Sök
        </button>
      </form>

      {candidates !== null && candidates.length === 0 && (
        <p className="settings-sub-desc">Ingen vuxen hittades med den e-postadressen.</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <ul className="child-share-list">
          {candidates.map((candidate) => (
            <li className="child-share-list__item" key={`${candidate.accountId}-${candidate.memberId}`}>
              <span>{candidate.memberName} ({candidate.accountName})</span>
              <select aria-label="Åtkomst" onChange={(e) => setAccess(e.target.value as AccessLevel)} value={access}>
                <option value="view">Kan visa</option>
                <option value="edit">Kan redigera</option>
              </select>
              <button className="secondary-button" onClick={() => grant(candidate, access)} type="button">
                Dela
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
