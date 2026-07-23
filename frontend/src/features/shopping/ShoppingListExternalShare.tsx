import "./ShoppingListExternalShare.css";
import { useState } from "react";
import type { FormEvent } from "react";
import { Search, Share2, X } from "lucide-react";
import { useShoppingShareManagement } from "./useShoppingSharesState";
import type { AccessLevel, Id } from "@shared/types";

type Props = {
  listId: Id;
};

// Dela en inköpslista med en annan familj, icke-transitivt (ADR-0026,
// 2026-07-23, Zaidas önskemål: "shoppinglistor skall kunna delas mellan
// olika familjer") — samma lookup-via-e-post-flöde som ChildShareSettings.tsx
// (ADR-0024), men scopat till EN given lista (redan inne i dess eget kort i
// Inställningar → Inköpslistor, ingen egen list-väljare behövs här).
export function ShoppingListExternalShare({ listId }: Props) {
  const { shares, candidates, loading, lookup, grant, revoke, clearCandidates } =
    useShoppingShareManagement(listId);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<AccessLevel>("view");
  const [open, setOpen] = useState(false);

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) lookup(email.trim());
  }

  function toggleOpen() {
    setOpen((prev) => !prev);
    clearCandidates();
    setEmail("");
  }

  return (
    <div className="shopping-external-share">
      <button
        aria-expanded={open}
        className="secondary-button"
        onClick={toggleOpen}
        type="button"
      >
        <Share2 size={14} />
        Dela med annan familj
      </button>

      {open && (
        <div className="shopping-external-share__panel">
          <p className="settings-sub-desc">
            Ge en vuxen i en helt annan familj (eller en annan vuxen i din egen) åtkomst till den här
            listan. Personen kan aldrig dela vidare till någon annan.
          </p>

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
      )}
    </div>
  );
}
