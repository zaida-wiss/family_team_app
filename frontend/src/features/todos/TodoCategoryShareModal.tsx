import "./ParentTodoThreadView.css";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { useCategoryShareManagement } from "./useTodoCategorySharesState";
import { useCrossAccountMembers } from "./useCrossAccountFamilyState";
import { isChildMember } from "./selectors";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { AccessLevel, Id, Member, MembershipMemberSummary, Role } from "@shared/types";

type Props = {
  categoryId: Id;
  categoryName: string;
  currentMember: Member;
  members: Member[];
  roles: Role[];
  onClose: () => void;
};

type FamilyOption = {
  accountId: Id;
  accountName: string;
  members: MembershipMemberSummary[];
};

// Dela en EGEN kategori med en annan familj, icke-transitivt (2026-08-06,
// Zaidas önskemål: "det skall vara möjligt att dela sina egna kategorier
// med utvalda familjer") — samma e-postlookup-flöde som
// ShoppingListExternalShare.tsx (ADR-0026), men EGEN, lokalt scopad CSS
// (todo-thread-view__share-*, se ParentTodoThreadView.css) istället för att
// återanvända ChildShareSettings.css:s .child-share-list/.wish-form-klasser
// utan att importera den filen — samma cross-chunk-CSS-fälla som redan
// dokumenterats flera gånger denna session, bara aldrig fixad i just
// ShoppingListExternalShare.tsx (utanför scope här).
//
// Uppdaterad SAMMA DAG (Zaidas rättelse: "jag vill alltid kunna dela mitt
// innehåll med mina familjemedlemmar genom att klicka på deras profilbild,
// samt att jag även skall kunna välja vilken familj jag vill dela kategorin
// med") — avatarklick ersätter e-postsökning som HUVUDVÄG för familjer jag
// redan känner till (min egen familj + Mina familjekonton, samma
// useCrossAccountMembers-hook som Hem-vyns familjefilter 2026-07-31
// återanvänds här rakt av, ingen ny backend-endpoint). E-postsökning finns
// kvar bakom en döljd disclosure för en genuint okänd, ej ansluten familj.
// Etiketten i mottagarens Hem-vy bytt från källfamiljens KONTOnamn till
// DELARENS eget namn samma dag (getSharedCategoryTodos:s nya sharedByName,
// todosService.ts) — "döpt till medlemmens namn".
export function TodoCategoryShareModal({ categoryId, categoryName, currentMember, members, roles, onClose }: Props) {
  const { shares, candidates, loading, lookup, grant, revoke, clearCandidates } = useCategoryShareManagement(categoryId);
  const crossAccountGroups = useCrossAccountMembers();
  const [familyId, setFamilyId] = useState<Id>(currentMember.accountId);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const overlay = useOverlayDismiss(onClose);

  const ownFamilyMembers: MembershipMemberSummary[] = useMemo(
    () =>
      members
        .filter((m) => m.deletedAt === null && m.id !== currentMember.id && !isChildMember(m, roles))
        .map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl, color: m.color, isChild: false })),
    [members, roles, currentMember.id]
  );

  const familyOptions: FamilyOption[] = useMemo(
    () => [
      { accountId: currentMember.accountId, accountName: "Min egen familj", members: ownFamilyMembers },
      ...crossAccountGroups.map((g) => ({
        accountId: g.accountId,
        accountName: g.accountName,
        members: g.members.filter((m) => !m.isChild)
      }))
    ],
    [currentMember.accountId, ownFamilyMembers, crossAccountGroups]
  );

  const selectedFamily = familyOptions.find((f) => f.accountId === familyId) ?? familyOptions[0];
  const shareableMembers = selectedFamily.members.filter(
    (m) => !shares.some((s) => s.memberId === m.id && s.accountId === selectedFamily.accountId)
  );

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
          Klicka på en familjemedlems profilbild för att dela kategorins uppgifter med dem. Personen kan aldrig dela
          vidare till någon annan.
        </p>

        {shares.length > 0 && (
          <ul className="todo-thread-view__share-list">
            {shares.map((share) => (
              <li className="todo-thread-view__share-row" key={`${share.accountId}-${share.memberId}`}>
                <span>
                  {share.memberName} ({share.accountName})
                </span>
                <select
                  aria-label={`Åtkomst för ${share.memberName}`}
                  onChange={(e) =>
                    grant(
                      { memberId: share.memberId, accountId: share.accountId, memberName: share.memberName, accountName: share.accountName },
                      e.target.value as AccessLevel
                    )
                  }
                  value={share.access}
                >
                  <option value="view">Kan visa</option>
                  <option value="edit">Kan redigera</option>
                </select>
                <button
                  aria-label={`Ta bort delning med ${share.memberName}`}
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

        {familyOptions.length > 1 && (
          <label className="field-label">
            Familj
            <select className="text-input" onChange={(e) => setFamilyId(e.target.value)} value={familyId}>
              {familyOptions.map((f) => (
                <option key={f.accountId} value={f.accountId}>
                  {f.accountName}
                </option>
              ))}
            </select>
          </label>
        )}

        {shareableMembers.length === 0 ? (
          <p className="field-hint field-hint--neutral">
            {selectedFamily.members.length === 0
              ? "Inga vuxna att dela med i den familjen ännu."
              : "Redan delad med alla i den familjen."}
          </p>
        ) : (
          <div aria-label="Dela med en familjemedlem" className="todo-thread-view__share-avatar-row" role="group">
            {shareableMembers.map((m) => (
              <button
                aria-label={`Dela med ${m.name}`}
                className="todo-thread-view__share-avatar-btn"
                key={m.id}
                onClick={() => grant({ memberId: m.id, accountId: selectedFamily.accountId, memberName: m.name, accountName: selectedFamily.accountName }, "view")}
                title={`Dela med ${m.name}`}
                type="button"
              >
                <MemberAvatar member={m} size="small" />
                <span aria-hidden="true">{m.name}</span>
              </button>
            ))}
          </div>
        )}

        <button className="secondary-button" onClick={() => setEmailOpen((v) => !v)} type="button">
          {emailOpen ? "Dölj e-postsökning" : "Eller dela via e-post…"}
        </button>

        {emailOpen && (
          <>
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
                    <span>
                      {candidate.memberName} ({candidate.accountName})
                    </span>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        grant(candidate, "view");
                        clearCandidates();
                        setEmail("");
                      }}
                      type="button"
                    >
                      Dela
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
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
