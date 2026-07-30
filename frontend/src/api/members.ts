import type { AccessLevel, Member, MembershipMemberSummary, MyMembership } from "@shared/types";
import { api, request, subscribeToServerEvents } from "./client";

// memberName/accountName läggs på server-side (2026-07-28, live uppslag,
// aldrig lagrat/inaktuellt) — se childSharesService.ts:s listShares.
// status/relation/expiresAt tillagda 2026-07-29 (ADR-0024-uppföljning).
export type ChildShare = {
  memberId: string;
  accountId: string;
  access: AccessLevel;
  grantedBy: string;
  grantedAt: string;
  status: "pending" | "accepted";
  relation: string | null;
  expiresAt: string | null;
  memberName: string;
  accountName: string;
};

// Mina väntande barn-delningar att godkänna/avböja (2026-07-29).
export type PendingChildShare = {
  childId: string;
  childAccountId: string;
  childName: string;
  homeAccountName: string;
  grantedByName: string;
  access: AccessLevel;
  relation: string | null;
  expiresAt: string | null;
};

export type ChildShareCandidate = {
  memberId: string;
  accountId: string;
  memberName: string;
  accountName: string;
};

export const membersApi = {
  getAll: () => request<Member[]>(api("members")),
  // Mina familjekonton (2026-07-25, utökad 2026-07-29 med se/gå ur). De två
  // senare ligger på accounts/-rutten (inte members/) eftersom de slår upp
  // anroparens medlemskap via userId direkt och inte ska gå via
  // membersRouterns blanketta attachAccountId-mellanlager.
  getMyMemberships: () => request<MyMembership[]>(api("members/my-memberships")),
  getMembershipMembers: (accountId: string) =>
    request<MembershipMemberSummary[]>(api(`accounts/${accountId}/members`)),
  leaveMembership: (accountId: string) =>
    request<{ ok: boolean }>(api(`accounts/${accountId}/leave`), { method: "POST" }),
  create: (member: Member) =>
    request<{ id: string }>(api("members"), { method: "POST", body: JSON.stringify(member) }),
  update: (id: string, patch: Partial<Member>) =>
    request<{ ok: boolean }>(api(`members/${id}`), {
      method: "PATCH",
      body: JSON.stringify(patch),
      // keepalive (2026-07-06): updateMemberNavigation-anrop (bl.a. todoThreadOrder)
      // är avsiktligt fire-and-forget, ofta följt direkt av en sidomladdning
      // (t.ex. användaren drar en kategori och laddar om för att se att det sparats).
      // Utan keepalive kan webbläsaren avbryta ett pågående fetch-anrop när
      // dokumentet börjar laddas om, vilket tyst tappar sparningen. Bodyn här är
      // alltid liten (fält, aldrig filer — se keepalive-specets 64 kB-gräns),
      // så säkert att sätta på alla members-patchar.
      keepalive: true
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}`), { method: "DELETE" }),
  restore: (id: string) =>
    request<{ ok: boolean }>(api(`members/${id}/restore`), {
      method: "PATCH",
      body: JSON.stringify({})
    }),
  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  purgeTrash: () =>
    request<{ ok: boolean }>(api("members/purge-trash"), { method: "POST", body: JSON.stringify({}) }),
  setCredentials: (id: string, username: string, password: string) =>
    request<{ id: string; username: string }>(api(`members/${id}/credentials`), {
      method: "PUT",
      body: JSON.stringify({ username, password })
    }),
  // Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024).
  listShares: (childId: string) =>
    request<ChildShare[]>(api(`members/${childId}/share`)),
  lookupShareCandidate: (childId: string, email: string) =>
    request<{ memberships: ChildShareCandidate[] }>(api(`members/${childId}/share/lookup`), {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  shareChild: (
    childId: string,
    granteeMemberId: string,
    granteeAccountId: string,
    access: AccessLevel,
    relation: string | null,
    expiresAt: string | null
  ) =>
    request<ChildShare[]>(api(`members/${childId}/share`), {
      method: "POST",
      body: JSON.stringify({ granteeMemberId, granteeAccountId, access, relation, expiresAt })
    }),
  revokeShare: (childId: string, granteeAccountId: string, granteeMemberId: string) =>
    request<{ ok: boolean }>(api(`members/${childId}/share/${granteeAccountId}/${granteeMemberId}`), {
      method: "DELETE"
    }),
  // Mottagarsidan (2026-07-29) — mina egna väntande delningar, oavsett
  // vilket konto barnet tillhör.
  getPendingChildShares: () => request<PendingChildShare[]>(api("members/pending-child-shares")),
  acceptChildShare: (childAccountId: string, childId: string) =>
    request<{ ok: boolean }>(api(`members/pending-child-shares/${childAccountId}/${childId}/accept`), {
      method: "POST",
      body: JSON.stringify({})
    }),
  declineChildShare: (childAccountId: string, childId: string) =>
    request<{ ok: boolean }>(api(`members/pending-child-shares/${childAccountId}/${childId}/decline`), {
      method: "POST",
      body: JSON.stringify({})
    }),
  // Överför ett barn permanent till en annan familj (2026-07-27) — samma
  // lookupShareCandidate ovan hittar mottagaren, oåterkalleligt till
  // skillnad från delning.
  transferChild: (childId: string, targetMemberId: string, targetAccountId: string) =>
    request<{ ok: boolean }>(api(`members/${childId}/transfer`), {
      method: "POST",
      body: JSON.stringify({ targetMemberId, targetAccountId })
    }),
  // Realtidssynk (2026-07-17, Zaidas fynd: stjärnor uppdaterades inte förrän
  // en omladdning) — samma SSE-mönster som todosApi redan använder.
  subscribeToChanges: (onChange: () => void) => {
    let initialConnect = true;
    return subscribeToServerEvents(api("members/events"), (eventName) => {
      if (eventName === "members-changed") {
        onChange();
      } else if (eventName === "connected") {
        if (initialConnect) { initialConnect = false; return; }
        onChange();
      }
    });
  }
};
