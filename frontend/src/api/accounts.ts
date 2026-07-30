import type { AccessLevel, Account, FamilyConnectionScope, Membership } from "@shared/types";
import { api, request } from "./client";

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"), se familyConnectionsService.ts.
export type FamilyConnectionCandidate = { accountId: string; accountName: string };
export type PendingFamilyConnection = {
  connectionId: string;
  fromAccountId: string;
  fromAccountName: string;
  exposedMemberCount: number;
  access: AccessLevel;
  dataScope: FamilyConnectionScope;
};
export type MyFamilyConnections = {
  exposedByMe: {
    connectionId: string;
    otherAccountId: string;
    otherAccountName: string;
    exposedMemberIds: string[];
    access: AccessLevel;
    dataScope: FamilyConnectionScope;
  }[];
  exposedToMe: {
    fromAccountId: string;
    fromAccountName: string;
    exposedMemberIds: string[];
    access: AccessLevel;
    dataScope: FamilyConnectionScope;
  }[];
};

export const accountsApi = {
  setup: (name: string) =>
    request<{ membership: Membership }>(api("accounts/setup"), {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  get: (id: string) => request<Account>(api(`accounts/${id}`)),
  update: (id: string, patch: Partial<Account>) =>
    request<{ ok: boolean }>(api(`accounts/${id}`), { method: "PUT", body: JSON.stringify(patch) }),
  export: (id: string) =>
    request<unknown>(api(`accounts/${id}/export`)),
  delete: (id: string) =>
    request<{ ok: boolean }>(api(`accounts/${id}`), { method: "DELETE" }),
  // Mina familjekonton (2026-07-29): överlåt/radera oavsett vilket konto
  // som är AKTIVT just nu — se accountsService.ts.
  transferOwnership: (id: string, newOwnerMemberId: string) =>
    request<{ ok: boolean }>(api(`accounts/${id}/transfer-ownership`), {
      method: "POST",
      body: JSON.stringify({ newOwnerMemberId })
    }),
  deleteAsCreator: (id: string) =>
    request<{ ok: boolean }>(api(`accounts/${id}/as-creator`), { method: "DELETE" }),
  lookupConnectionCandidate: (accountId: string, email: string) =>
    request<{ accounts: FamilyConnectionCandidate[] }>(api(`accounts/${accountId}/family-connections/lookup`), {
      method: "POST",
      body: JSON.stringify({ email })
    }),
  sendConnectionInvitation: (
    accountId: string,
    otherAccountId: string,
    exposedMemberIds: string[],
    access: AccessLevel,
    dataScope: Partial<FamilyConnectionScope>
  ) =>
    request<{ ok: boolean }>(api(`accounts/${accountId}/family-connections`), {
      method: "POST",
      body: JSON.stringify({ otherAccountId, exposedMemberIds, access, dataScope })
    }),
  getMyConnections: (accountId: string) =>
    request<MyFamilyConnections>(api(`accounts/${accountId}/family-connections`)),
  getPendingConnections: (accountId: string) =>
    request<PendingFamilyConnection[]>(api(`accounts/${accountId}/family-connections/pending`)),
  acceptConnection: (
    accountId: string,
    fromAccountId: string,
    exposedMemberIds: string[],
    access: AccessLevel,
    dataScope: Partial<FamilyConnectionScope>
  ) =>
    request<{ ok: boolean }>(api(`accounts/${accountId}/family-connections/pending/${fromAccountId}/accept`), {
      method: "POST",
      body: JSON.stringify({ exposedMemberIds, access, dataScope })
    }),
  declineConnection: (accountId: string, fromAccountId: string) =>
    request<{ ok: boolean }>(api(`accounts/${accountId}/family-connections/pending/${fromAccountId}/decline`), {
      method: "POST"
    }),
  revokeConnection: (accountId: string, connectionId: string) =>
    request<{ ok: boolean }>(api(`accounts/${accountId}/family-connections/${connectionId}`), { method: "DELETE" })
};
