import "./ParentTodoThreadView.css";
import { useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { useCategoryShareManagement } from "./useTodoCategorySharesState";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import type { AccessLevel, Id } from "@shared/types";

type Props = {
  categoryId: Id;
  categoryName: string;
  onClose: () => void;
};

// Dela en EGEN kategori med en annan familj, icke-transitivt (2026-08-06,
// Zaidas önskemål: "det skall vara möjligt att dela sina egna kategorier
// med utvalda familjer") — öppnas via "Dela" i kategorimenyn
// (ParentTodoThreadView.tsx). Samma e-postlookup-flöde som
// ShoppingListExternalShare.tsx (ADR-0026), men EGEN, lokalt scopad CSS
// (todo-thread-view__share-*, se ParentTodoThreadView.css) istället för att
// återanvända ChildShareSettings.css:s .child-share-list/.wish-form-klasser
// utan att importera den filen — samma cross-chunk-CSS-fälla som redan
// dokumenterats flera gånger denna session, bara aldrig fixad i just
// ShoppingListExternalShare.tsx (utanför scope här).
export function TodoCategoryShareModal({ categoryId, categoryName, onClose }: Props) {
  const { shares, candidates, loading, lookup, grant, revoke, clearCandidates } = useCategoryShareManagement(categoryId);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<AccessLevel>("view");
  const overlay = useOverlayDismiss(onClose);

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) lookup(email.trim());
  }

  return (
    <div className="todo-thread-view__reuse-overlay" {...overlay}>
      <div
        aria-labelledby="share-category-title"
        aria-modal="true"
        className="todo-thread-view__reuse-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="todo-thread-view__info-header">
          <h3 id="share-category-title">Dela {categoryName}</h3>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <p className="field-hint field-hint--neutral">
          Ge en vuxen i en helt annan familj (eller en annan vuxen i din egen) åtkomst till den här kategorins
          uppgifter. Personen kan aldrig dela vidare till någon annan.
        </p>

        {shares.length > 0 && (
          <ul className="todo-thread-view__share-list">
            {shares.map((share) => (
              <li className="todo-thread-view__share-row" key={`${share.accountId}-${share.memberId}`}>
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

        <form className="todo-thread-view__share-lookup" onSubmit={submitLookup}>
          <input
            aria-label="E-post till en vuxen"
            className="text-input"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-post till en vuxen"
            type="email"
            value={email}
          />
          <button className="secondary-button" disabled={loading} type="submit">
            Sök
          </button>
        </form>

        {candidates !== null && candidates.length === 0 && (
          <p className="field-hint field-hint--neutral">Ingen vuxen hittades med den e-postadressen.</p>
        )}

        {candidates !== null && candidates.length > 0 && (
          <ul className="todo-thread-view__share-list">
            {candidates.map((candidate) => (
              <li className="todo-thread-view__share-row" key={`${candidate.accountId}-${candidate.memberId}`}>
                <span>{candidate.memberName} ({candidate.accountName})</span>
                <select aria-label="Åtkomst" onChange={(e) => setAccess(e.target.value as AccessLevel)} value={access}>
                  <option value="view">Kan visa</option>
                  <option value="edit">Kan redigera</option>
                </select>
                <button
                  className="secondary-button"
                  onClick={() => { grant(candidate, access); clearCandidates(); setEmail(""); }}
                  type="button"
                >
                  Dela
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="todo-thread-view__reuse-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
}
