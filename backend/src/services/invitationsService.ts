import bcrypt from "bcryptjs";
import { z } from "zod";
import { InvitationModel, createInvitationSchema } from "../db/models/Invitation.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { RoleModel } from "../db/models/Role.js";
import { UserModel } from "../db/models/User.js";
import { validate } from "../utils/validate.js";
import { signAccess, signRefresh, fetchMemberships } from "../utils/tokens.js";
import { AppError } from "../utils/errors.js";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export async function invite(accountId: string, memberId: string | null | undefined, data: unknown) {
  const { invitedEmail, memberName, roleId } = validate(createInvitationSchema, data);

  const inviter = await MemberModel.findOne({ id: memberId, accountId, deletedAt: null });
  if (!inviter) {
    throw new AppError(403, "Du tillhör inte detta konto");
  }

  const role = await RoleModel.findOne({ id: roleId });
  if (!role) {
    throw new AppError(404, "Rollen hittades inte");
  }

  const existingMember = await MemberModel.findOne({ accountId, deletedAt: null }).where("userId").ne(null);
  if (existingMember) {
    const existingUser = await UserModel.findOne({ id: existingMember.userId, email: invitedEmail });
    if (existingUser) {
      const alreadyMember = await MemberModel.findOne({ accountId, userId: existingUser.id, deletedAt: null });
      if (alreadyMember) {
        throw new AppError(409, "Användaren är redan medlem i kontot");
      }
    }
  }

  const isChild = role.isChildRole ?? false;
  const now = new Date();
  const invitation = new InvitationModel({
    id: `invite-${crypto.randomUUID()}`,
    accountId,
    invitedEmail,
    invitedByMemberId: inviter.id,
    memberName,
    roleId,
    isChild,
    token: crypto.randomUUID(),
    status: "pending",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  await invitation.save();

  const account = await AccountModel.findOne({ id: accountId }, { _id: 0, __v: 0 });
  return {
    invitation: invitation.toObject(),
    inviteUrl: `${FRONTEND_URL}/invite/${invitation.token}`,
    accountName: account?.name
  };
}

export async function getInvitation(token: string) {
  const invitation = await InvitationModel.findOne({ token }, { _id: 0, __v: 0 });
  if (!invitation) {
    throw new AppError(404, "Inbjudan hittades inte");
  }
  if (invitation.status !== "pending" || new Date(invitation.expiresAt) < new Date()) {
    throw new AppError(410, "Inbjudan är inte längre giltig");
  }

  const account = await AccountModel.findOne({ id: invitation.accountId }, { _id: 0, __v: 0 });
  const role = await RoleModel.findOne({ id: invitation.roleId }, { _id: 0, __v: 0 });
  return { invitation: invitation.toObject(), account, role };
}

const acceptSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    email: z.string().email(),
    password: z.string().min(8, "Lösenordet måste vara minst 8 tecken"),
    name: z.string().min(1)
  }),
  z.object({ action: z.literal("login"), email: z.string().email(), password: z.string() })
]);

export async function acceptInvitation(token: string, data: unknown) {
  const invitation = await InvitationModel.findOne({ token });
  if (!invitation || invitation.status !== "pending") {
    throw new AppError(410, "Inbjudan är inte längre giltig");
  }
  if (new Date(invitation.expiresAt) < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    throw new AppError(410, "Inbjudan har gått ut");
  }

  const body = validate(acceptSchema, data);
  let user = await UserModel.findOne({ email: body.email });

  if (body.action === "register") {
    if (user) {
      throw new AppError(409, "E-postadressen är redan registrerad, logga in istället");
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    user = new UserModel({
      id: `user-${crypto.randomUUID()}`,
      email: body.email,
      passwordHash,
      name: body.name,
      createdAt: new Date().toISOString(),
      tokenVersion: 0
    });
    await user.save();
  } else {
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new AppError(401, "Fel e-postadress eller lösenord");
    }
  }

  const member = new MemberModel({
    id: `member-${crypto.randomUUID()}`,
    accountId: invitation.accountId,
    userId: user.id,
    name: invitation.memberName,
    roleId: invitation.roleId,
    isChild: invitation.isChild,
    avatarUrl: null,
    dashboardTheme: invitation.isChild ? "space" : "focus",
    deletedAt: null,
    deletedBy: null
  });
  await member.save();

  invitation.status = "accepted";
  await invitation.save();

  const refreshToken = signRefresh(user.id, user.tokenVersion);
  const accessToken = signAccess(user.id);
  return {
    refreshToken,
    accessToken,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    memberships: await fetchMemberships(user.id)
  };
}
