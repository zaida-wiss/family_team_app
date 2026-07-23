import { z } from "zod";
import { ShoppingListModel } from "../db/models/ShoppingList.js";
import { MemberModel } from "../db/models/Member.js";
import { UserModel } from "../db/models/User.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "../utils/errors.js";
import { getAllRoles } from "./rolesService.js";
import { canManageExternalShoppingListShares } from "../../../shared/permissions.js";
import type { AccessLevel } from "../../../shared/types.js";

// Dela en inköpslista med en annan familj, icke-transitivt (ADR-0026,
// 2026-07-23) — samma mönster som childSharesService.ts (ADR-0024). Se
// ShoppingList.externalSharedWith i shared/types.ts och
// canManageExternalShoppingListShares i shared/permissions.ts för den
// strukturella spärren mot vidaredelning.

export const ShareShoppingListExternallyBodySchema = z.object({
  granteeMemberId: z.string().min(1),
  granteeAccountId: z.string().min(1),
  access: z.enum(["view", "edit"])
});

async function requireMember(memberId: string | null, accountId: string) {
  const member = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return member;
}

async function requireManageableList(listId: string, accountId: string, callerMemberId: string | null) {
  const caller = await requireMember(callerMemberId, accountId);
  const roles = await getAllRoles(accountId);
  const list = await ShoppingListModel.findOne({ id: listId, accountId, deletedAt: null });
  if (!list) {
    throw new AppError(404, "Inköpslista hittades inte");
  }
  if (!canManageExternalShoppingListShares(caller, list, roles)) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return list;
}

// Slår upp en vuxens kontomedlemskap via e-post (samma mönster som
// childSharesService.ts/invitationsService.ts) — avslöjar inget om
// mottagaren INTE hittas utöver en tom lista, men kräver redan
// canManageExternalShoppingListShares för att ens anropas.
export async function lookupShareCandidate(listId: string, accountId: string, callerMemberId: string | null, email: string) {
  await requireManageableList(listId, accountId, callerMemberId);

  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) {
    return { memberships: [] };
  }

  const members = await MemberModel.find({ userId: user.id, deletedAt: null, isChild: false });
  const accountIds = [...new Set(members.map((m) => m.accountId))];
  const accounts = await AccountModel.find({ id: { $in: accountIds } }, { _id: 0, __v: 0 });

  return {
    memberships: members.map((m) => ({
      memberId: m.id,
      accountId: m.accountId,
      memberName: m.name,
      accountName: accounts.find((a) => a.id === m.accountId)?.name ?? "Okänt konto"
    }))
  };
}

export async function listShares(listId: string, accountId: string, callerMemberId: string | null) {
  const list = await requireManageableList(listId, accountId, callerMemberId);
  return list.externalSharedWith ?? [];
}

export async function shareListExternally(listId: string, accountId: string, callerMemberId: string | null, data: unknown) {
  const list = await requireManageableList(listId, accountId, callerMemberId);
  const { granteeMemberId, granteeAccountId, access } = ShareShoppingListExternallyBodySchema.parse(data);

  const grantee = await MemberModel.findOne({ id: granteeMemberId, accountId: granteeAccountId, deletedAt: null, isChild: false });
  if (!grantee) {
    throw new AppError(404, "Mottagaren hittades inte");
  }

  const existing = list.externalSharedWith ?? [];
  const withoutExisting = existing.filter(
    (s) => !(s.memberId === granteeMemberId && s.accountId === granteeAccountId)
  );
  list.externalSharedWith = [
    ...withoutExisting,
    {
      memberId: granteeMemberId,
      accountId: granteeAccountId,
      access: access as AccessLevel,
      grantedBy: callerMemberId!,
      grantedAt: new Date().toISOString()
    }
  ];
  list.markModified("externalSharedWith");
  await list.save();
  return list.externalSharedWith;
}

export async function revokeExternalShare(
  listId: string,
  accountId: string,
  callerMemberId: string | null,
  granteeMemberId: string,
  granteeAccountId: string
) {
  const list = await requireManageableList(listId, accountId, callerMemberId);
  list.externalSharedWith = (list.externalSharedWith ?? []).filter(
    (s) => !(s.memberId === granteeMemberId && s.accountId === granteeAccountId)
  );
  list.markModified("externalSharedWith");
  await list.save();
}
