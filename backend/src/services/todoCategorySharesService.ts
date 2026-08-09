import { z } from "zod";
import { TodoCategoryModel } from "../db/models/TodoCategory.js";
import { MemberModel } from "../db/models/Member.js";
import { UserModel } from "../db/models/User.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "../utils/errors.js";
import { requireAdultMember } from "./todoCategoriesService.js";
import type { AccessLevel } from "../../../shared/types.js";

// Dela en EGEN kategori med en annan familj, icke-transitivt (2026-08-06,
// Zaidas önskemål: "det skall vara möjligt att dela sina egna kategorier
// med utvalda familjer"). Samma lookup-via-e-post-mönster som
// shoppingSharesService.ts (ADR-0026) och childSharesService.ts (ADR-0024)
// — se shared/types.ts:s TodoCategory.externalSharedWith och
// getExternalCategoryAccess i shared/permissions.ts.

export const ShareCategoryExternallyBodySchema = z.object({
  granteeMemberId: z.string().min(1),
  granteeAccountId: z.string().min(1),
  access: z.enum(["view", "edit"])
});

async function requireManageableCategory(categoryId: string, accountId: string, callerMemberId: string | null) {
  await requireAdultMember(callerMemberId, accountId);
  const category = await TodoCategoryModel.findOne({ id: categoryId, accountId, deletedAt: null });
  if (!category) {
    throw new AppError(404, "Kategori hittades inte");
  }
  return category;
}

// Slår upp en vuxens kontomedlemskap via e-post — avslöjar inget om
// mottagaren INTE hittas utöver en tom lista, men kräver redan en vuxen i
// kategorins EGET konto för att ens anropas.
export async function lookupShareCandidate(categoryId: string, accountId: string, callerMemberId: string | null, email: string) {
  await requireManageableCategory(categoryId, accountId, callerMemberId);

  const user = await UserModel.findOne({ email: email.toLowerCase() });
  if (!user) {
    return { memberships: [] };
  }

  const members = await MemberModel.find({ userId: user.id, deletedAt: null, isChild: false });
  const accountIds = [...new Set(members.map((m) => m.accountId))];
  // type:"personal" exkluderat (2026-08-10, ADR-0033) — se samma kommentar
  // i shoppingSharesService.ts.
  const accounts = await AccountModel.find(
    { id: { $in: accountIds }, deletedAt: null, type: { $ne: "personal" } },
    { _id: 0, __v: 0 }
  );
  const familyAccountIds = new Set(accounts.map((a) => a.id));

  return {
    memberships: members
      .filter((m) => familyAccountIds.has(m.accountId))
      .map((m) => ({
        memberId: m.id,
        accountId: m.accountId,
        memberName: m.name,
        accountName: accounts.find((a) => a.id === m.accountId)?.name ?? "Okänt konto"
      }))
  };
}

// memberName/accountName denormaliseras live vid LÄSNING (2026-08-06,
// Zaidas fynd: "det skall stå bekräftat vilka man delar med"), samma mönster
// som childSharesService.ts:s listShares — kan aldrig bli inaktuellt.
export async function listShares(categoryId: string, accountId: string, callerMemberId: string | null) {
  const category = await requireManageableCategory(categoryId, accountId, callerMemberId);
  const shares = category.externalSharedWith ?? [];
  if (shares.length === 0) return [];

  const memberIds = [...new Set(shares.map((s) => s.memberId))];
  const accountIds = [...new Set(shares.map((s) => s.accountId))];
  const [members, accounts] = await Promise.all([
    MemberModel.find({ id: { $in: memberIds } }),
    AccountModel.find({ id: { $in: accountIds }, deletedAt: null }, { _id: 0, __v: 0 })
  ]);

  return shares.map((s) => ({
    memberId: s.memberId,
    accountId: s.accountId,
    access: s.access,
    grantedBy: s.grantedBy,
    grantedAt: s.grantedAt,
    memberName: members.find((m) => m.id === s.memberId)?.name ?? "Okänd",
    accountName: accounts.find((a) => a.id === s.accountId)?.name ?? "Okänt konto"
  }));
}

export async function shareCategoryExternally(categoryId: string, accountId: string, callerMemberId: string | null, data: unknown) {
  const category = await requireManageableCategory(categoryId, accountId, callerMemberId);
  const { granteeMemberId, granteeAccountId, access } = ShareCategoryExternallyBodySchema.parse(data);

  const grantee = await MemberModel.findOne({ id: granteeMemberId, accountId: granteeAccountId, deletedAt: null, isChild: false });
  if (!grantee) {
    throw new AppError(404, "Mottagaren hittades inte");
  }

  const existing = category.externalSharedWith ?? [];
  const withoutExisting = existing.filter(
    (s) => !(s.memberId === granteeMemberId && s.accountId === granteeAccountId)
  );
  category.externalSharedWith = [
    ...withoutExisting,
    {
      memberId: granteeMemberId,
      accountId: granteeAccountId,
      access: access as AccessLevel,
      grantedBy: callerMemberId!,
      grantedAt: new Date().toISOString()
    }
  ];
  category.markModified("externalSharedWith");
  await category.save();
  return category.externalSharedWith;
}

export async function revokeExternalShare(
  categoryId: string,
  accountId: string,
  callerMemberId: string | null,
  granteeMemberId: string,
  granteeAccountId: string
) {
  const category = await requireManageableCategory(categoryId, accountId, callerMemberId);
  category.externalSharedWith = (category.externalSharedWith ?? []).filter(
    (s) => !(s.memberId === granteeMemberId && s.accountId === granteeAccountId)
  );
  category.markModified("externalSharedWith");
  await category.save();
}
