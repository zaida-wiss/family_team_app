import { z } from "zod";
import { MemberModel } from "../db/models/Member.js";
import { UserModel } from "../db/models/User.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "../utils/errors.js";
import { getAllRoles } from "./rolesService.js";
import { canManageChildShares } from "../../../shared/permissions.js";
import type { AccessLevel } from "../../../shared/types.js";

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22) — se Member.childSharedWith i shared/types.ts och
// canManageChildShares i shared/permissions.ts för den strukturella
// spärren mot vidaredelning.

export const ShareChildBodySchema = z.object({
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

async function requireManageableChild(childId: string, accountId: string, callerMemberId: string | null) {
  const caller = await requireMember(callerMemberId, accountId);
  const roles = await getAllRoles(accountId);
  const child = await MemberModel.findOne({ id: childId, accountId, deletedAt: null });
  if (!child || !child.isChild) {
    throw new AppError(404, "Barnet hittades inte");
  }
  if (!canManageChildShares(caller, child, roles)) {
    throw new AppError(403, "Åtkomst nekad");
  }
  return child;
}

// Steg 1 av delningsflödet — slår upp en vuxens kontomedlemskap via e-post
// (samma UserModel-mönster som invitationsService.ts) så anroparen kan välja
// RÄTT medlemskap om mottagaren råkar vara vuxen i FLERA familjer. Avslöjar
// inget om mottagaren INTE hittas (samma "reveal nothing"-resonemang som
// forgotPassword) utöver en tom lista — men kräver redan canManageChildShares
// för att ens anropas, så det är åtminstone inte en helt öppen enumering.
export async function lookupShareCandidate(childId: string, accountId: string, callerMemberId: string | null, email: string) {
  await requireManageableChild(childId, accountId, callerMemberId);

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

export async function listShares(childId: string, accountId: string, callerMemberId: string | null) {
  const child = await requireManageableChild(childId, accountId, callerMemberId);
  return child.childSharedWith ?? [];
}

export async function shareChild(childId: string, accountId: string, callerMemberId: string | null, data: unknown) {
  const child = await requireManageableChild(childId, accountId, callerMemberId);
  const { granteeMemberId, granteeAccountId, access } = ShareChildBodySchema.parse(data);

  const grantee = await MemberModel.findOne({ id: granteeMemberId, accountId: granteeAccountId, deletedAt: null, isChild: false });
  if (!grantee) {
    throw new AppError(404, "Mottagaren hittades inte");
  }

  const existing = child.childSharedWith ?? [];
  const withoutExisting = existing.filter(
    (s) => !(s.memberId === granteeMemberId && s.accountId === granteeAccountId)
  );
  child.childSharedWith = [
    ...withoutExisting,
    {
      memberId: granteeMemberId,
      accountId: granteeAccountId,
      access: access as AccessLevel,
      grantedBy: callerMemberId!,
      grantedAt: new Date().toISOString()
    }
  ];
  child.markModified("childSharedWith");
  await child.save();
  return child.childSharedWith;
}

export async function revokeShare(childId: string, accountId: string, callerMemberId: string | null, granteeMemberId: string, granteeAccountId: string) {
  const child = await requireManageableChild(childId, accountId, callerMemberId);
  child.childSharedWith = (child.childSharedWith ?? []).filter(
    (s) => !(s.memberId === granteeMemberId && s.accountId === granteeAccountId)
  );
  child.markModified("childSharedWith");
  await child.save();
}
