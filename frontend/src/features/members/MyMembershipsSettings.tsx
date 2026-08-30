import "../children/ChildShareSettings.css";
import { useState } from "react";
import { CreateAccountForm } from "../auth/CreateAccountForm";
import { useMyMemberships } from "../todos/useCrossAccountFamilyState";
import type { Id, Member, MembershipMemberSummary, MyMembership } from "@shared/types";

type Props = {
  currentMember: Member;
  onLogout: () => Promise<void>;
  onCreateFamily: (name: string) => Promise<void>;
};

// Mina familjekonton (2026-07-25, Zaidas önskemål: "du skall se vilka
// familjer du är med i"). Utökad 2026-07-29 (Zaidas önskemål: "jag behöver
// även kunna radera familjer som jag skapat och se vilka som ingår i den,
// samt välja att överlåta den till någon annan familjemedlem, samt gå ur
// familjen") — se membersService.ts/accountsService.ts för
// behörighetsreglerna (skaparen måste överlåta innan den kan gå ur, sista
// medlemmen får inte gå ur, bara skaparen får radera). Rent administrativ
// medlemskapshantering — visa/dölj-toggeln för familjevyn (2026-08-30)
// flyttades till en egen underkategori, se FamilyViewSettings.tsx, så
// samma checkbox inte kontrolleras från två olika ställen.
export function MyMembershipsSettings({ currentMember, onLogout, onCreateFamily }: Props) {
  const {
    memberships,
    membersByAccount,
    loadMembers,
    leaveAccount,
    transferOwnership,
    deleteCreatedAccount
  } = useMyMemberships(currentMember.id, [], () => {});
  const [creatingFamily, setCreatingFamily] = useState(false);

  async function handleMutated(accountId: Id) {
    if (accountId === currentMember.accountId) {
      await onLogout();
    }
  }

  return (
    <div className="settings-sub">
      <p className="empty-note">
        Alla familjekonton du är medlem i. Familjer du själv skapat kan du radera eller överlåta
        till någon annan — annars kan du gå ur. Vill du dölja en familjs uppgifter i familjevyn på
        Hem-panelen, se Familjevy.
      </p>
      {memberships.length === 0 ? (
        <p className="empty-note">Du är inte medlem i något konto.</p>
      ) : (
        <ul className="child-share-list">
          {memberships.map((m) => (
            <MembershipRow
              currentAccountId={currentMember.accountId}
              key={m.accountId}
              loadedMembers={membersByAccount[m.accountId] ?? null}
              membership={m}
              onDelete={async () => {
                await deleteCreatedAccount(m.accountId);
                await handleMutated(m.accountId);
              }}
              onLeave={async () => {
                await leaveAccount(m.accountId);
                await handleMutated(m.accountId);
              }}
              onLoadMembers={() => loadMembers(m.accountId)}
              onTransfer={(newOwnerMemberId) => transferOwnership(m.accountId, newOwnerMemberId)}
            />
          ))}
        </ul>
      )}

      {/* Ny familj (2026-08-11, flyttad hit från Konto → Konto — Zaidas
          fynd: att skapa ett NYTT familjekonto hör ihop med listan över
          familjer man redan är med i/kan byta mellan, inte med att redigera
          DET AKTUELLA kontots namn) — samma onCreateFamily som tidigare. */}
      <div className="settings-sub">
        <h3 className="settings-sub-title">Ny familj</h3>
        <p className="empty-note">Du kan vara med i flera familjer samtidigt — byt mellan dem i Inställningar → Konto → Byt vy.</p>
        {creatingFamily ? (
          <CreateAccountForm
            onCancel={() => setCreatingFamily(false)}
            onSubmit={async (familyName) => {
              await onCreateFamily(familyName);
              setCreatingFamily(false);
            }}
          />
        ) : (
          <button className="secondary-button" onClick={() => setCreatingFamily(true)} type="button">
            Skapa ny familj
          </button>
        )}
      </div>
    </div>
  );
}

type RowProps = {
  membership: MyMembership;
  currentAccountId: Id;
  loadedMembers: MembershipMemberSummary[] | null;
  onLoadMembers: () => Promise<MembershipMemberSummary[]>;
  onLeave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onTransfer: (newOwnerMemberId: Id) => Promise<void>;
};

type Confirming = "leave" | "delete" | "transfer" | null;

function MembershipRow({
  membership,
  currentAccountId,
  loadedMembers,
  onLoadMembers,
  onLeave,
  onDelete,
  onTransfer
}: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [transferTarget, setTransferTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleExpanded() {
    setExpanded((current) => !current);
    if (!loadedMembers) {
      try {
        await onLoadMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunde inte hämta medlemmar");
      }
    }
  }

  async function handleLeave() {
    if (confirming !== "leave") {
      setConfirming("leave");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onLeave();
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte gå ur familjen");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (confirming !== "delete") {
      setConfirming("delete");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte radera familjen");
    } finally {
      setBusy(false);
    }
  }

  async function handleTransfer() {
    if (!transferTarget) return;
    if (confirming !== "transfer") {
      setConfirming("transfer");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onTransfer(transferTarget);
      setConfirming(null);
      setTransferTarget("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte överlåta familjen");
    } finally {
      setBusy(false);
    }
  }

  const transferCandidates = (loadedMembers ?? []).filter((m) => !m.isChild);

  return (
    <li className="child-share-list__item child-share-list__item--confirmed">
      <div className="child-share-list__row">
        <div>
          <strong>{membership.accountName}</strong>
          {membership.isCreator && <small> · skapad av dig</small>}
          {membership.accountId === currentAccountId && <small> · ditt aktiva konto</small>}
        </div>
        <button className="ghost-button" onClick={toggleExpanded} type="button">
          {expanded ? "Dölj medlemmar" : "Visa medlemmar"}
        </button>
      </div>

      {expanded && (
        <>
          <ul className="child-share-list" aria-label={`Medlemmar i ${membership.accountName}`}>
            {(loadedMembers ?? []).map((member) => (
              <li key={member.id}>
                <small>
                  {member.name}
                  {member.isChild ? " (barn)" : ""}
                </small>
              </li>
            ))}
          </ul>
          {/* 2026-08-11, Zaidas önskemål: "vad där inne skall var och en
              bestämma vad de vill dela med sig till övriga familjemedlemmar.
              Endast barnens inställningar kan ses av föräldrarna, de vuxna
              ska bara kunna se vad de själva valt att dela med sig av" —
              rent förklarande text, ingen ny data. Vuxnas delning är redan
              opt-in/privat-som-standard (ADR/Story 3, 2026-08-11) och styrs
              från Kalender-fliken, inte härifrån — den här listan visar
              bara namn, aldrig kalendrar/uppgifter för andra vuxna. */}
          <p className="empty-note">
            Vuxna delar bara det de själva valt att dela med familjen (t.ex. kalenderhändelser —
            se Kalender-fliken). Barns kalendrar och inställningar hanteras av familjens
            administratörer under Familjemedlemmar.
          </p>
        </>
      )}

      {error && (
        <p className="empty-note" role="alert">
          {error}
        </p>
      )}

      {membership.isCreator ? (
        <div className="child-share-settings__grant-options">
          <select
            aria-label={`Ny ägare av ${membership.accountName}`}
            disabled={!expanded || busy}
            onChange={(e) => setTransferTarget(e.target.value)}
            value={transferTarget}
          >
            <option value="">Överlåt till…</option>
            {transferCandidates.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <button
            className="ghost-button"
            disabled={!transferTarget || busy}
            onClick={handleTransfer}
            type="button"
          >
            {confirming === "transfer" ? "Bekräfta överlåtelse" : "Överlåt ägarskap"}
          </button>
          <button className="danger-button" disabled={busy} onClick={handleDelete} type="button">
            {confirming === "delete" ? "Bekräfta radering" : "Radera familjen"}
          </button>
        </div>
      ) : (
        <button
          className="danger-button"
          disabled={busy || membership.memberCount <= 1}
          onClick={handleLeave}
          type="button"
        >
          {confirming === "leave" ? "Bekräfta, gå ur" : "Gå ur familjen"}
        </button>
      )}
    </li>
  );
}
