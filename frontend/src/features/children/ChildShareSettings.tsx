import "./ChildShareSettings.css";
import { useState } from "react";
import type { FormEvent } from "react";
import { Search, X } from "lucide-react";
import { useChildShareManagement, useChildTransfer } from "../todos/useChildSharesState";
import type { AccessLevel, Id, Member } from "@shared/types";
import type { ChildShare, ChildShareCandidate } from "../../api/members";

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
//
// 2026-07-28, Zaidas önskemål: "det skall stå bekräftat vilka barn man
// delar med vem och vilka behörigheter de har. Det måste synas i en lista"
// + "man ska även kunna välja flera barn på en gång, inte bara ett i
// taget" — se useChildShareManagement (nu barn-aggregerande) för
// datalagret; den här komponenten visar en enda kombinerad lista över ALLA
// barns delningar (barn → mottagare → behörighet) och låter flera barn
// kryssas i samtidigt innan en delning beviljas.
export function ChildShareSettings({ childMembers }: Props) {
  const childIds = childMembers.map((c) => c.id);
  const { sharesByChild, candidates, loading, lookup, grant, revoke, clearCandidates } =
    useChildShareManagement(childIds);
  const [selectedChildIds, setSelectedChildIds] = useState<Set<Id>>(
    () => new Set(childMembers.length === 1 ? childIds : [])
  );
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<AccessLevel>("view");

  // Transfer-flödet gäller fortsatt bara ETT barn i taget (en oåterkallelig
  // flytt av hela medlemskapet, inte en delnings-grant — ingen anledning
  // att kunna välja flera samtidigt där).
  const [transferChildId, setTransferChildId] = useState<Id>(childMembers[0]?.id ?? "");
  const {
    candidates: transferCandidates,
    loading: transferLookupLoading,
    transferring,
    lookup: lookupTransfer,
    transfer,
    clearCandidates: clearTransferCandidates
  } = useChildTransfer(transferChildId || null);
  const [transferEmail, setTransferEmail] = useState("");
  // Tvåstegsbekräftelse (samma mönster som Radera-knappar på andra ställen
  // i appen) — men extra viktigt här: en överföring går INTE att ångra,
  // till skillnad från en delning som alltid kan återkallas.
  const [confirmingTransferKey, setConfirmingTransferKey] = useState<string | null>(null);

  if (childMembers.length === 0) return null;

  const childNameById = new Map(childMembers.map((c) => [c.id, c.name]));
  const allShares = childMembers.flatMap((child) =>
    (sharesByChild[child.id] ?? []).map((share) => ({ ...share, childId: child.id }))
  );

  function toggleChild(id: Id) {
    setSelectedChildIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectTransferChild(id: Id) {
    setTransferChildId(id);
    clearTransferCandidates();
    setTransferEmail("");
    setConfirmingTransferKey(null);
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) lookup(email.trim());
  }

  function submitTransferLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (transferEmail.trim()) lookupTransfer(transferEmail.trim());
    setConfirmingTransferKey(null);
  }

  function confirmOrExecuteTransfer(candidate: ChildShareCandidate) {
    const key = `${candidate.accountId}-${candidate.memberId}`;
    if (confirmingTransferKey !== key) {
      setConfirmingTransferKey(key);
      return;
    }
    setConfirmingTransferKey(null);
    transfer(candidate).catch(console.error);
  }

  function revokeShare(share: ChildShare & { childId: Id }) {
    revoke(share.childId, share);
  }

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">Dela barn</h3>
      <p className="settings-sub-desc">
        Ge en annan vuxen — i din egen familj eller i en helt annan familj — åtkomst till ett eller
        flera barns uppgifter. Personen kan aldrig dela vidare till någon annan.
      </p>

      {allShares.length > 0 ? (
        <ul className="child-share-list" aria-label="Delade barn">
          {allShares.map((share) => (
            <li
              className="child-share-list__item child-share-list__item--confirmed"
              key={`${share.childId}-${share.accountId}-${share.memberId}`}
            >
              <div className="child-share-list__row">
                <div>
                  <strong>{childNameById.get(share.childId) ?? "Barn"}</strong>
                  <small> delas med {share.memberName} ({share.accountName})</small>
                </div>
                <button
                  aria-label={`Ta bort delning av ${childNameById.get(share.childId) ?? "barnet"} med ${share.memberName}`}
                  className="icon-button danger"
                  onClick={() => revokeShare(share)}
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
              <small>{share.access === "edit" ? "Kan redigera" : "Kan visa"}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="settings-sub-desc">Inga barn delas med någon just nu.</p>
      )}

      {childMembers.length > 1 && (
        <div aria-label="Vilka barn ska delas?" className="child-share-picker" role="group">
          {childMembers.map((child) => (
            <button
              className={
                "child-share-picker__btn" +
                (selectedChildIds.has(child.id) ? " child-share-picker__btn--on" : "")
              }
              key={child.id}
              onClick={() => toggleChild(child.id)}
              type="button"
            >
              {child.name}
            </button>
          ))}
        </div>
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
              <button
                className="secondary-button"
                disabled={selectedChildIds.size === 0}
                onClick={() => grant(candidate, access, Array.from(selectedChildIds))}
                type="button"
              >
                Dela ({selectedChildIds.size || 0})
              </button>
            </li>
          ))}
        </ul>
      )}
      {candidates !== null && candidates.length > 0 && selectedChildIds.size === 0 && (
        <p className="settings-sub-desc">Välj minst ett barn ovan innan du delar.</p>
      )}

      <h3 className="settings-sub-title child-share-settings__transfer-title">Överför barn till en annan familj</h3>
      <p className="settings-sub-desc">
        Flyttar barnet PERMANENT till en annan familjs konto — hela historiken (uppgifter, kalender,
        belöningar, Medaljer/Rekord) följer med. Går inte att ångra. Barnet försvinner härifrån direkt.
      </p>

      {childMembers.length > 1 && (
        <select
          aria-label="Barn att överföra"
          className="wish-form-input"
          onChange={(e) => selectTransferChild(e.target.value)}
          value={transferChildId}
        >
          {childMembers.map((child) => (
            <option key={child.id} value={child.id}>{child.name}</option>
          ))}
        </select>
      )}

      <form className="wish-form" onSubmit={submitTransferLookup}>
        <input
          aria-label="E-post till mottagande familjs vuxen"
          className="wish-form-input"
          onChange={(e) => setTransferEmail(e.target.value)}
          placeholder="E-post till mottagande familjs vuxen"
          type="email"
          value={transferEmail}
        />
        <button className="wish-form-btn" disabled={transferLookupLoading} type="submit">
          <Search size={16} /> Sök
        </button>
      </form>

      {transferCandidates !== null && transferCandidates.length === 0 && (
        <p className="settings-sub-desc">Ingen vuxen hittades med den e-postadressen.</p>
      )}

      {transferCandidates !== null && transferCandidates.length > 0 && (
        <ul className="child-share-list">
          {transferCandidates.map((candidate) => {
            const key = `${candidate.accountId}-${candidate.memberId}`;
            const confirming = confirmingTransferKey === key;
            return (
              <li className="child-share-list__item" key={key}>
                <span>{candidate.memberName} ({candidate.accountName})</span>
                <button
                  className={confirming ? "danger-button" : "secondary-button"}
                  disabled={transferring}
                  onClick={() => confirmOrExecuteTransfer(candidate)}
                  type="button"
                >
                  {confirming ? "Bekräfta överföring" : "Överför"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
