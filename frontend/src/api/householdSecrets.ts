import type { HouseholdSecretKind } from "@shared/types";
import { api, request } from "./client";

export type HouseholdSecretEntry = {
  id: string;
  accountId: string;
  kind: HouseholdSecretKind;
  title: string;
  username: string | null;
  secret: string;
  notes: string | null;
  cost: number | null;
  renewalDate: string | null;
  createdBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
};

type SecretBody = {
  kind: HouseholdSecretKind;
  title: string;
  username: string | null;
  secret: string;
  notes: string | null;
  cost: number | null;
  renewalDate: string | null;
};

export const householdSecretsApi = {
  getAll: () => request<HouseholdSecretEntry[]>(api("household-secrets")),
  create: (body: SecretBody) =>
    request<HouseholdSecretEntry>(api("household-secrets"), { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: SecretBody) =>
    request<{ ok: boolean }>(api(`household-secrets/${id}`), { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) =>
    request<{ ok: boolean }>(api(`household-secrets/${id}`), { method: "DELETE" })
};
