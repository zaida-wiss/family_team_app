import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { AccountModel } from "../db/models/Account.js";
import { MemberModel } from "../db/models/Member.js";
import { RoleModel } from "../db/models/Role.js";
import { UserModel } from "../db/models/User.js";
import type { PermissionKey } from "../../../shared/types.js";

const setupSchema = z.object({
  name: z.string().min(1, "Kontonamn krävs").max(80),
  type: z.enum(["family", "workplace"])
});

const ALL_PERMISSIONS = [
  "canManageMembers", "canManageRoles",
  "canSeeAllTodos", "canSeeOwnTodos", "canCreateTodos", "canScheduleRecurringTodos",
  "canCompleteAssignedTodos", "canEditAnyTodos", "canDeleteAnyTodos", "canApproveTodos",
  "canSeeAllCalendar", "canSeeOwnCalendar", "canCreateCalendar", "canEditCalendar",
  "canImportCalendar", "canExportCalendar",
  "canSeeShoppingLists", "canCreateShoppingLists", "canEditShoppingLists",
  "canViewTrash", "canRestoreFromTrash",
  "canCreateChildAccounts", "canManageChildTodos"
] satisfies PermissionKey[];

export const accountsRouter = Router();

accountsRouter.post("/setup", requireAuth, async (request, response) => {
  const result = setupSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({ error: result.error.errors[0]?.message ?? "Ogiltiga värden" });
    return;
  }
  const { name, type } = result.data;

  const user = await UserModel.findOne({ id: request.userId });
  if (!user) {
    response.status(401).json({ error: "Användare hittades inte" });
    return;
  }

  const accountId = `account-${crypto.randomUUID()}`;
  const roleId = `role-${crypto.randomUUID()}`;
  const memberId = `member-${crypto.randomUUID()}`;

  const permissions = Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, true])) as Record<PermissionKey, boolean>;

  const role = new RoleModel({ id: roleId, name: "Admin", permissions });
  const account = new AccountModel({ id: accountId, name, type, createdBy: memberId });
  const member = new MemberModel({
    id: memberId,
    accountId,
    userId: user.id,
    name: user.name,
    roleId,
    isChild: false,
    avatarUrl: null,
    dashboardTheme: "focus",
    deletedAt: null,
    deletedBy: null
  });

  await Promise.all([role.save(), account.save(), member.save()]);

  response.status(201).json({
    membership: {
      member: member.toObject(),
      account: account.toObject()
    }
  });
});

accountsRouter.get("/:id", async (request, response) => {
  const account = await AccountModel.findOne({ id: request.params.id }, { _id: 0, __v: 0 });
  if (!account) {
    response.status(404).json({ error: "Konto hittades inte" });
    return;
  }
  response.json(account);
});

accountsRouter.put("/:id", requireAuth, async (request, response) => {
  const account = await AccountModel.findOne({ id: request.params.id });
  if (!account) {
    response.status(404).json({ error: "Konto hittades inte" });
    return;
  }
  Object.assign(account, request.body);
  await account.save();
  response.json({ ok: true });
});
