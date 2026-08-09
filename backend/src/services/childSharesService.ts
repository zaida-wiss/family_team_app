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
// spärren mot vidaredelning. Utökad 2026-07-29 med ett accept-steg
// (mottagaren måste godkänna innan delningen är aktiv), en fri
// relations-text och ett valfritt tidsspann (isShareActive).

export const ShareChildBodySchema = z.object({
  granteeMemberId: z.string().min(1),
  granteeAccountId: z.string().min(1),
  access: z.enum(["view", "edit"]),
  relation: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional()
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

// 2026-07-28, Zaidas önskemål: "det skall stå bekräftat vilka barn man
// delar med vem och vilka behörigheter de har" — den råa lagrade posten har
// bara memberId/accountId, inget läsbart namn. Slår upp mottagarens namn +
// kontonamn live (samma mönster som lookupShareCandidate ovan) istället för
// att denormalisera vid skapande, så namnet aldrig kan bli inaktuellt om
// mottagaren byter namn.
export async function listShares(childId: string, accountId: string, callerMemberId: string | null) {
  const child = await requireManageableChild(childId, accountId, callerMemberId);
  const shares = child.childSharedWith ?? [];
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
    status: s.status ?? "accepted",
    relation: s.relation ?? null,
    expiresAt: s.expiresAt ?? null,
    memberName: members.find((m) => m.id === s.memberId)?.name ?? "Okänd",
    accountName: accounts.find((a) => a.id === s.accountId)?.name ?? "Okänt konto"
  }));
}

// Skapar (eller ersätter) en delning — sätts ALLTID till "pending", även om
// mottagaren redan hade en tidigare, accepterad delning för samma barn: en
// ändrad behörighetsnivå/relation/tidsspann är ett nytt förslag som ska
// godkännas på nytt, inte tyst utökas. Delningen är alltså inaktiv
// (isShareActive false) tills mottagaren själv accepterar den, se
// acceptShare nedan.
export async function shareChild(childId: string, accountId: string, callerMemberId: string | null, data: unknown) {
  const child = await requireManageableChild(childId, accountId, callerMemberId);
  const { granteeMemberId, granteeAccountId, access, relation, expiresAt } = ShareChildBodySchema.parse(data);

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
      grantedAt: new Date().toISOString(),
      status: "pending",
      relation: relation ?? null,
      expiresAt: expiresAt ?? null
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

// 2026-07-29 — mottagarsidan av delningsflödet. Till skillnad från alla
// funktioner ovan (som kräver canManageChildShares i BARNETS EGET konto)
// styrs dessa av vem den INLOGGADE ANROPAREN är — de hittar sina egna
// pending-delningar via (memberId, accountId), oavsett vilket konto barnet
// tillhör.
export async function getPendingSharesForMe(callerMemberId: string, callerAccountId: string) {
  const children = await MemberModel.find({
    isChild: true,
    deletedAt: null,
    childSharedWith: { $elemMatch: { memberId: callerMemberId, accountId: callerAccountId, status: "pending" } }
  });

  const homeAccountIds = [...new Set(children.map((c) => c.accountId))];
  const grantedByIds = [
    ...new Set(
      children.flatMap((c) =>
        (c.childSharedWith ?? [])
          .filter((s) => s.memberId === callerMemberId && s.accountId === callerAccountId && s.status === "pending")
          .map((s) => s.grantedBy)
      )
    )
  ];
  const [accounts, granters] = await Promise.all([
    AccountModel.find({ id: { $in: homeAccountIds }, deletedAt: null }, { _id: 0, __v: 0 }),
    MemberModel.find({ id: { $in: grantedByIds } })
  ]);

  return children.flatMap((child) => {
    const share = (child.childSharedWith ?? []).find(
      (s) => s.memberId === callerMemberId && s.accountId === callerAccountId && s.status === "pending"
    );
    if (!share) return [];
    return [
      {
        childId: child.id,
        childAccountId: child.accountId,
        childName: child.name,
        homeAccountName: accounts.find((a) => a.id === child.accountId)?.name ?? "Okänt konto",
        grantedByName: granters.find((m) => m.id === share.grantedBy)?.name ?? "Okänd",
        access: share.access,
        relation: share.relation ?? null,
        expiresAt: share.expiresAt ?? null
      }
    ];
  });
}

async function requirePendingShare(childId: string, childAccountId: string, callerMemberId: string, callerAccountId: string) {
  await requireMember(callerMemberId, callerAccountId);
  const child = await MemberModel.findOne({ id: childId, accountId: childAccountId, deletedAt: null, isChild: true });
  if (!child) {
    throw new AppError(404, "Barnet hittades inte");
  }
  const share = (child.childSharedWith ?? []).find(
    (s) => s.memberId === callerMemberId && s.accountId === callerAccountId
  );
  if (!share || share.status !== "pending") {
    throw new AppError(404, "Ingen väntande delning hittades");
  }
  return child;
}

export async function acceptShare(childId: string, childAccountId: string, callerMemberId: string, callerAccountId: string) {
  const child = await requirePendingShare(childId, childAccountId, callerMemberId, callerAccountId);
  const share = (child.childSharedWith ?? []).find(
    (s) => s.memberId === callerMemberId && s.accountId === callerAccountId
  )!;
  share.status = "accepted";
  child.markModified("childSharedWith");
  await child.save();
}

// Avböjer en väntande delning — tar bort posten helt (samma som en
// återkallelse, fast utförd av MOTTAGAREN istället för barnets egen familj).
export async function declineShare(childId: string, childAccountId: string, callerMemberId: string, callerAccountId: string) {
  const child = await requirePendingShare(childId, childAccountId, callerMemberId, callerAccountId);
  child.childSharedWith = (child.childSharedWith ?? []).filter(
    (s) => !(s.memberId === callerMemberId && s.accountId === callerAccountId)
  );
  child.markModified("childSharedWith");
  await child.save();
}
