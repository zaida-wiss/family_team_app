import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Request, Response } from "express";
import { InvitationModel, createInvitationSchema } from "../db/models/Invitation.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { RoleModel } from "../db/models/Role.js";
import { UserModel } from "../db/models/User.js";
import { validate } from "../utils/validate.js";
import { signAccess, signRefresh, setRefreshCookie, fetchMemberships } from "../utils/tokens.js";

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export async function invite(req: Request, res: Response) {
  const { accountId } = req.params;
  const { invitedEmail, memberName, roleId } = validate(createInvitationSchema, req.body);

  const inviter = await MemberModel.findOne({ id: req.memberId, accountId, deletedAt: null });
  if (!inviter) {
    res.status(403).json({ error: "Du tillhör inte detta konto" });
    return;
  }

  const role = await RoleModel.findOne({ id: roleId });
  if (!role) {
    res.status(404).json({ error: "Rollen hittades inte" });
    return;
  }

  const existingMember = await MemberModel.findOne({ accountId, deletedAt: null }).where("userId").ne(null);
  if (existingMember) {
    const existingUser = await UserModel.findOne({ id: existingMember.userId, email: invitedEmail });
    if (existingUser) {
      const alreadyMember = await MemberModel.findOne({ accountId, userId: existingUser.id, deletedAt: null });
      if (alreadyMember) {
        res.status(409).json({ error: "Användaren är redan medlem i kontot" });
        return;
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
  res.status(201).json({
    invitation: invitation.toObject(),
    inviteUrl: `${FRONTEND_URL}/invite/${invitation.token}`,
    accountName: account?.name
  });
}

export async function getInvitation(req: Request, res: Response) {
  const invitation = await InvitationModel.findOne({ token: req.params.token }, { _id: 0, __v: 0 });
  if (!invitation) {
    res.status(404).json({ error: "Inbjudan hittades inte" });
    return;
  }
  if (invitation.status !== "pending" || new Date(invitation.expiresAt) < new Date()) {
    res.status(410).json({ error: "Inbjudan är inte längre giltig" });
    return;
  }

  const account = await AccountModel.findOne({ id: invitation.accountId }, { _id: 0, __v: 0 });
  const role = await RoleModel.findOne({ id: invitation.roleId }, { _id: 0, __v: 0 });
  res.json({ invitation: invitation.toObject(), account, role });
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

export async function acceptInvitation(req: Request, res: Response) {
  const invitation = await InvitationModel.findOne({ token: req.params.token });
  if (!invitation || invitation.status !== "pending") {
    res.status(410).json({ error: "Inbjudan är inte längre giltig" });
    return;
  }
  if (new Date(invitation.expiresAt) < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    res.status(410).json({ error: "Inbjudan har gått ut" });
    return;
  }

  const body = validate(acceptSchema, req.body);
  let user = await UserModel.findOne({ email: body.email });

  if (body.action === "register") {
    if (user) {
      res.status(409).json({ error: "E-postadressen är redan registrerad, logga in istället" });
      return;
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
      res.status(401).json({ error: "Fel e-postadress eller lösenord" });
      return;
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

  // Issue session so the user is immediately logged in after accepting
  setRefreshCookie(res, signRefresh(user.id, user.tokenVersion));
  res.json({
    accessToken: signAccess(user.id),
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    memberships: await fetchMemberships(user.id)
  });
}
