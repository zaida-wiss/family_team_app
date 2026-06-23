import type { Account, Invitation, Membership, Role, User } from "@shared/types";
import { api, request } from "./client";

type LoginResponse = { accessToken: string; user: User; memberships: Membership[] };

export const invitationsApi = {
  invite: (
    accountId: string,
    payload: { invitedEmail: string; memberName: string; roleId: string }
  ) =>
    request<{ invitation: Invitation; inviteUrl: string; accountName: string }>(
      api(`accounts/${accountId}/invite`),
      { method: "POST", body: JSON.stringify(payload) }
    ),
  get: (token: string) =>
    request<{ invitation: Invitation; account: Account; role: Role }>(
      api(`invitations/${token}`)
    ),
  accept: (
    token: string,
    payload:
      | { action: "register"; email: string; password: string; name: string }
      | { action: "login"; email: string; password: string }
  ) =>
    request<LoginResponse>(
      api(`invitations/${token}/accept`),
      { method: "POST", body: JSON.stringify(payload) }
    )
};
