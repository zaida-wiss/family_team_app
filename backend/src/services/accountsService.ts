import { z } from "zod";
import { AccountModel } from "../db/models/Account.js";
import { CalendarModel } from "../db/models/Calendar.js";
import { MemberModel } from "../db/models/Member.js";
import { RewardModel } from "../db/models/Reward.js";
import { RewardShopModel } from "../db/models/RewardShop.js";
import { PurchasedRewardModel } from "../db/models/PurchasedReward.js";
import { InvitationModel } from "../db/models/Invitation.js";
import { AnalyticsEventModel } from "../db/models/AnalyticsEvent.js";
import { RoleModel } from "../db/models/Role.js";
import { ShoppingListModel } from "../db/models/ShoppingList.js";
import { TodoModel } from "../db/models/Todo.js";
import { UserModel } from "../db/models/User.js";
import { validate } from "../utils/validate.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { PermissionKey } from "../../../shared/types.js";

const setupSchema = z.object({
  name: z.string().min(1, "Kontonamn krävs").max(80)
});

const PARENT_PERMISSIONS: PermissionKey[] = [
  "canManageMembers", "canManageRoles", "canCreateChildAccounts", "canManageChildTodos",
  "canSeeAllTodos", "canCreateTodos", "canScheduleRecurringTodos",
  "canEditAnyTodos", "canDeleteAnyTodos", "canApproveTodos",
  "canSeeAllCalendar", "canCreateCalendar", "canEditCalendar",
  "canImportCalendar", "canExportCalendar",
  "canSeeShoppingLists", "canCreateShoppingLists", "canEditShoppingLists",
  "canViewTrash", "canRestoreFromTrash"
];

const CHILD_PERMISSIONS: PermissionKey[] = [
  "canSeeOwnTodos", "canCompleteAssignedTodos", "canSeeOwnCalendar"
];

const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "canManageMembers", "canManageRoles",
  "canSeeAllTodos", "canSeeOwnTodos", "canCreateTodos", "canScheduleRecurringTodos",
  "canCompleteAssignedTodos", "canEditAnyTodos", "canDeleteAnyTodos", "canApproveTodos",
  "canSeeAllCalendar", "canSeeOwnCalendar", "canCreateCalendar", "canEditCalendar",
  "canImportCalendar", "canExportCalendar",
  "canSeeShoppingLists", "canCreateShoppingLists", "canEditShoppingLists",
  "canViewTrash", "canRestoreFromTrash",
  "canCreateChildAccounts", "canManageChildTodos"
];

function makePermissions(enabled: PermissionKey[]) {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, enabled.includes(k)])) as Record<PermissionKey, boolean>;
}

export async function setupAccount(userId: string, data: unknown) {
  const { name } = validate(setupSchema, data);

  const user = await UserModel.findOne({ id: userId });
  if (!user) {
    throw new AppError(401, "Användare hittades inte");
  }

  const accountId = `account-${crypto.randomUUID()}`;
  const memberId = `member-${crypto.randomUUID()}`;
  const förälderRoleId = `role-${crypto.randomUUID()}`;
  const barnRoleId = `role-${crypto.randomUUID()}`;

  await Promise.all([
    new RoleModel({
      id: förälderRoleId,
      name: "Förälder",
      isChildRole: false,
      permissions: makePermissions(PARENT_PERMISSIONS)
    }).save(),
    new RoleModel({
      id: barnRoleId,
      name: "Barn",
      isChildRole: true,
      permissions: makePermissions(CHILD_PERMISSIONS)
    }).save(),
    new AccountModel({ id: accountId, name, type: "family", createdBy: memberId }).save(),
    new MemberModel({
      id: memberId,
      accountId,
      userId: user.id,
      name: user.name,
      roleId: förälderRoleId,
      isChild: false,
      avatarUrl: null,
      dashboardTheme: "focus",
      deletedAt: null,
      deletedBy: null
    }).save()
  ]);

  const savedMember = await MemberModel.findOne({ id: memberId }, { _id: 0, __v: 0 });
  const savedAccount = await AccountModel.findOne({ id: accountId }, { _id: 0, __v: 0 });

  return { membership: { member: savedMember, account: savedAccount } };
}

export async function getAccount(id: string) {
  const account = await AccountModel.findOne({ id }, { _id: 0, __v: 0 });
  if (!account) {
    throw new AppError(404, "Konto hittades inte");
  }
  return account;
}

export async function updateAccount(id: string, patch: unknown) {
  const account = await AccountModel.findOne({ id });
  if (!account) {
    throw new AppError(404, "Konto hittades inte");
  }
  Object.assign(account, patch);
  await account.save();
}

export async function exportAccount(accountId: string, memberId: string | null | undefined) {
  const member = await MemberModel.findOne({ id: memberId });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }

  if (member.accountId !== accountId) {
    throw new AppError(403, "Åtkomst nekad");
  }

  const [account, members, , todos, calendars, shoppingLists, rewards] = await Promise.all([
    AccountModel.findOne({ id: accountId }, { _id: 0, __v: 0 }),
    MemberModel.find({ accountId }, { _id: 0, __v: 0 }),
    RoleModel.find({ id: { $in: [] } }, { _id: 0, __v: 0 }), // populated below
    TodoModel.find({ accountId }, { _id: 0, __v: 0 }),
    CalendarModel.find({ accountId }, { _id: 0, __v: 0 }),
    ShoppingListModel.find({ accountId }, { _id: 0, __v: 0 }),
    RewardModel.find({ accountId }, { _id: 0, __v: 0 })
  ]);

  const roleIds = (members as Array<{ roleId: string }>).map((m) => m.roleId);
  const populatedRoles = await RoleModel.find({ id: { $in: roleIds } }, { _id: 0, __v: 0 });

  return {
    exportedAt: new Date().toISOString(),
    gdprNote: "Exporterad enligt GDPR Art. 20 – rätten till dataportabilitet.",
    account,
    members,
    roles: populatedRoles,
    todos,
    calendars,
    shoppingLists,
    rewards
  };
}

const DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// GDPR artikel 17 (rätten till radering). Tvåstegsprocess, se
// docs/engineering-os/08-documentation/records/decisions/ADR-0007:
// 1) deleteAccount sätter deletedAt — memberUtils.accountIdOf spärrar därefter all
//    åtkomst till kontot omedelbart, precis som frontend redan lovar användaren.
// 2) purgeExpiredAccounts (körs av ett schemalagt jobb) hard-raderar konton vars
//    deletedAt är äldre än gallringsfönstret. Detta är de enda två platserna i
//    kodbasen som avsiktligt avviker från "aldrig hard delete".
export async function deleteAccount(accountId: string, memberId: string | null | undefined) {
  const member = await MemberModel.findOne({ id: memberId });
  if (!member) {
    throw new AppError(403, "Åtkomst nekad");
  }

  const account = await AccountModel.findOne({ id: accountId });
  if (!account) {
    throw new AppError(404, "Konto hittades inte");
  }

  if (account.id !== member.accountId) {
    throw new AppError(403, "Åtkomst nekad");
  }

  account.deletedAt = new Date().toISOString();
  await account.save();

  logger.info({ accountId, initiatedBy: memberId }, "Konto markerat för radering (GDPR artikel 17)");
}

async function purgeAccount(accountId: string) {
  const accountMembers = await MemberModel.find({ accountId }, { userId: 1, _id: 0 });
  const candidateUserIds = [...new Set(accountMembers.map((m) => m.userId).filter((id): id is string => !!id))];

  await Promise.all([
    MemberModel.deleteMany({ accountId }),
    TodoModel.deleteMany({ accountId }),
    CalendarModel.deleteMany({ accountId }),
    ShoppingListModel.deleteMany({ accountId }),
    RewardModel.deleteMany({ accountId }),
    RewardShopModel.deleteMany({ accountId }),
    PurchasedRewardModel.deleteMany({ accountId }),
    InvitationModel.deleteMany({ accountId }),
    AnalyticsEventModel.deleteMany({ accountId })
  ]);

  for (const userId of candidateUserIds) {
    const stillHasOtherAccount = await MemberModel.exists({ userId });
    if (!stillHasOtherAccount) {
      await UserModel.deleteOne({ id: userId });
    }
  }

  await AccountModel.deleteOne({ id: accountId });
}

// Anropas av det schemalagda gallringsjobbet (routes/admin.ts), inte direkt av användare.
export async function purgeExpiredAccounts(now = new Date()) {
  const cutoff = new Date(now.getTime() - DELETION_GRACE_PERIOD_MS).toISOString();
  const expired = await AccountModel.find(
    { deletedAt: { $ne: null, $lte: cutoff } },
    { id: 1, _id: 0 }
  );

  for (const account of expired) {
    await purgeAccount(account.id);
    logger.info({ accountId: account.id }, "Konto hard-raderat efter gallringsfönster (GDPR artikel 17)");
  }

  return { purgedCount: expired.length };
}
