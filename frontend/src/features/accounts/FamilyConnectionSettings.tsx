import "../children/ChildShareSettings.css";
import { useState } from "react";
import type { FormEvent } from "react";
import { Search } from "lucide-react";
import { useFamilyConnectionManagement } from "./useFamilyConnectionsState";
import type { AccessLevel, FamilyConnectionScope, Id, Member } from "@shared/types";

type Props = {
  accountId: Id;
  members: Member[];
};

const SCOPE_LABELS: { key: keyof FamilyConnectionScope; label: string }[] = [
  { key: "todos", label: "Uppgifter" },
  { key: "recipes", label: "Recept" },
  { key: "shoppingLists", label: "Inköpslistor" }
];

function ScopePicker({ scope, onChange }: { scope: FamilyConnectionScope; onChange: (scope: FamilyConnectionScope) => void }) {
  return (
    <div className="child-share-settings__grant-options">
      {SCOPE_LABELS.map(({ key, label }) => (
        <label className="child-share-settings__expiry-label" key={key}>
          <input
            checked={scope[key]}
            onChange={(e) => onChange({ ...scope, [key]: e.target.checked })}
            type="checkbox"
          />{" "}
          {label}
        </label>
      ))}
    </div>
  );
}

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"): ingen kontoåtkomst/medlemskap, bara extra sektioner i
// Todos-/Recept-/Inköpslistor-panelerna för de exponerade medlemmarnas
// data. Se ADR:ns rättelseavsnitt: Familjemedlemmar/Hem-växlaren/Kalendern/
// Barnvyn/Inställningar för dessa förblir OFÖRÄNDRADE — den här sektionen
// är den ENDA platsen anslutningar hanteras.
export function FamilyConnectionSettings({ accountId, members }: Props) {
  const { connections, pending, candidates, lookup, clearCandidates, invite, accept, decline, revoke } =
    useFamilyConnectionManagement(accountId);

  const [email, setEmail] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<Id>>(new Set());
  const [access, setAccess] = useState<AccessLevel>("view");
  const [scope, setScope] = useState<FamilyConnectionScope>({ todos: true, recipes: true, shoppingLists: true });

  // Ett accept-svar kräver samma tre val (medlemmar/access/scope) MEN för
  // MIN EGEN, oberoende exponering tillbaka — separat lokalt state per
  // väntande inbjudan (fromAccountId som nyckel).
  const [acceptDrafts, setAcceptDrafts] = useState<
    Record<string, { memberIds: Set<Id>; access: AccessLevel; scope: FamilyConnectionScope }>
  >({});

  function draftFor(fromAccountId: string) {
    return (
      acceptDrafts[fromAccountId] ?? {
        memberIds: new Set<Id>(),
        access: "view" as AccessLevel,
        scope: { todos: true, recipes: true, shoppingLists: true }
      }
    );
  }

  function updateDraft(fromAccountId: string, patch: Partial<{ memberIds: Set<Id>; access: AccessLevel; scope: FamilyConnectionScope }>) {
    setAcceptDrafts((current) => ({ ...current, [fromAccountId]: { ...draftFor(fromAccountId), ...patch } }));
  }

  function toggleMember(id: Id) {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) lookup(email.trim());
  }

  function sendInvite(otherAccountId: Id) {
    if (selectedMemberIds.size === 0) return;
    invite(otherAccountId, [...selectedMemberIds], access, scope).catch(console.error);
    setSelectedMemberIds(new Set());
    setEmail("");
  }

  function acceptPending(fromAccountId: string) {
    const draft = draftFor(fromAccountId);
    if (draft.memberIds.size === 0) return;
    accept(fromAccountId, [...draft.memberIds], draft.access, draft.scope).catch(console.error);
  }

  return (
    <div className="settings-sub">
      <h3 className="settings-sub-title">Familjeanslutningar</h3>
      <p className="settings-sub-desc">
        Anslut ditt konto till en annan familj — ingen ser hela ditt konto, bara de uppgifter,
        recept och inköpslistor ni själva väljer att visa för varandra. Din kalender, todolista,
        barnvy och inköpslista i övrigt påverkas inte.
      </p>

      {connections.exposedToMe.length > 0 && (
        <>
          <h4>Familjer som visar sin data för dig</h4>
          <ul className="child-share-list">
            {connections.exposedToMe.map((c) => (
              <li className="child-share-list__item child-share-list__item--confirmed" key={c.fromAccountId}>
                <strong>{c.fromAccountName}</strong>
                <small>
                  {" "}
                  {c.exposedMemberIds.length} medlem(mar) ·{" "}
                  {[
                    c.dataScope.todos && "Uppgifter",
                    c.dataScope.recipes && "Recept",
                    c.dataScope.shoppingLists && "Inköpslistor"
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}

      {connections.exposedByMe.length > 0 && (
        <>
          <h4>Familjer du visar din data för</h4>
          <ul className="child-share-list">
            {connections.exposedByMe.map((c) => (
              <li className="child-share-list__item child-share-list__item--confirmed" key={c.connectionId}>
                <div className="child-share-list__row">
                  <div>
                    <strong>{c.otherAccountName}</strong>
                    <small>
                      {" "}
                      {c.exposedMemberIds.length} medlem(mar) · {c.access === "edit" ? "Kan redigera" : "Kan visa"}
                    </small>
                  </div>
                  <button className="ghost-button" onClick={() => revoke(c.connectionId)} type="button">
                    Återkalla
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pending.length > 0 && (
        <>
          <h4>Väntande inbjudningar</h4>
          <ul className="child-share-list">
            {pending.map((p) => {
              const draft = draftFor(p.fromAccountId);
              return (
                <li className="child-share-list__item" key={p.connectionId}>
                  <strong>{p.fromAccountName}</strong>
                  <small> vill ansluta ({p.exposedMemberCount} medlem(mar) på deras sida)</small>
                  <p className="settings-sub-desc">Välj vilka av dina egna medlemmar du vill visa tillbaka:</p>
                  <div aria-label="Vilka av mina medlemmar ska visas?" className="child-share-picker" role="group">
                    {members.map((m) => (
                      <button
                        className={
                          "child-share-picker__btn" + (draft.memberIds.has(m.id) ? " child-share-picker__btn--on" : "")
                        }
                        key={m.id}
                        onClick={() => {
                          const next = new Set(draft.memberIds);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          updateDraft(p.fromAccountId, { memberIds: next });
                        }}
                        type="button"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                  <ScopePicker scope={draft.scope} onChange={(s) => updateDraft(p.fromAccountId, { scope: s })} />
                  <label className="child-share-settings__expiry-label">
                    <input
                      checked={draft.access === "edit"}
                      onChange={(e) => updateDraft(p.fromAccountId, { access: e.target.checked ? "edit" : "view" })}
                      type="checkbox"
                    />{" "}
                    Ge redigeringsåtkomst (annars bara visning)
                  </label>
                  <div className="child-share-list__row">
                    <button
                      className="wish-form-btn"
                      disabled={draft.memberIds.size === 0}
                      onClick={() => acceptPending(p.fromAccountId)}
                      type="button"
                    >
                      Acceptera
                    </button>
                    <button className="ghost-button" onClick={() => decline(p.fromAccountId)} type="button">
                      Avböj
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h4>Anslut en ny familj</h4>
      <form className="wish-form" onSubmit={submitLookup}>
        <input
          aria-label="E-post till en vuxen i den andra familjen"
          className="wish-form-input"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-post till en vuxen i den andra familjen"
          type="email"
          value={email}
        />
        <button className="wish-form-btn" type="submit">
          <Search size={16} /> Sök
        </button>
      </form>

      {candidates !== null && candidates.length === 0 && (
        <p className="settings-sub-desc">Ingen familj hittades med den e-postadressen.</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <>
          <p className="settings-sub-desc">Välj vilka av dina medlemmar du vill exponera:</p>
          <div aria-label="Vilka medlemmar ska visas?" className="child-share-picker" role="group">
            {members.map((m) => (
              <button
                className={"child-share-picker__btn" + (selectedMemberIds.has(m.id) ? " child-share-picker__btn--on" : "")}
                key={m.id}
                onClick={() => toggleMember(m.id)}
                type="button"
              >
                {m.name}
              </button>
            ))}
          </div>
          <ScopePicker scope={scope} onChange={setScope} />
          <label className="child-share-settings__expiry-label">
            <input checked={access === "edit"} onChange={(e) => setAccess(e.target.checked ? "edit" : "view")} type="checkbox" />{" "}
            Ge redigeringsåtkomst (annars bara visning)
          </label>
          <ul className="child-share-list">
            {candidates.map((c) => (
              <li className="child-share-list__item" key={c.accountId}>
                <div className="child-share-list__row">
                  <strong>{c.accountName}</strong>
                  <button
                    className="wish-form-btn"
                    disabled={selectedMemberIds.size === 0}
                    onClick={() => sendInvite(c.accountId)}
                    type="button"
                  >
                    Skicka inbjudan
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button className="ghost-button" onClick={clearCandidates} type="button">
            Avbryt sökning
          </button>
        </>
      )}
    </div>
  );
}
