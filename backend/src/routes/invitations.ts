import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { InvitationModel, createInvitationSchema } from "../db/models/Invitation.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { RoleModel } from "../db/models/Role.js";
import { UserModel, registerSchema } from "../db/models/User.js";
import { requireAuth } from "../middleware/auth.js";

function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error(result.error.errors[0]?.message ?? "Ogiltiga värden");
    (err as { status?: number }).status = 400;
    throw err;
  }
  return result.data;
}

export const invitationsRouter = Router();

invitationsRouter.post("/accounts/:accountId/invite", requireAuth, async (request, response) => {
  const { accountId } = request.params;
  const { invitedEmail, memberName, roleId, isChild } = validate(
    createInvitationSchema,
    request.body
  );

  const inviter = await MemberModel.findOne({
    id: request.memberId,
    accountId,
    deletedAt: null
  });
  if (!inviter) {
    response.status(403).json({ error: "Du tillhör inte detta konto" });
    return;
  }

  const existingMember = await MemberModel.findOne({
    accountId,
    deletedAt: null
  }).where("userId").ne(null);
  const existingUser = existingMember
    ? await UserModel.findOne({ id: existingMember.userId, email: invitedEmail })
    : null;
  if (existingUser) {
    const alreadyMember = await MemberModel.findOne({
      accountId,
      userId: existingUser.id,
      deletedAt: null
    });
    if (alreadyMember) {
      response.status(409).json({ error: "Användaren är redan medlem i kontot" });
      return;
    }
  }

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

  response.status(201).json({
    invitation: invitation.toObject(),
    inviteUrl: `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/invite/${invitation.token}`,
    accountName: account?.name
  });
});

invitationsRouter.get("/invitations/:token", async (request, response) => {
  const invitation = await InvitationModel.findOne(
    { token: request.params.token },
    { _id: 0, __v: 0 }
  );
  if (!invitation) {
    response.status(404).json({ error: "Inbjudan hittades inte" });
    return;
  }

  if (invitation.status !== "pending" || new Date(invitation.expiresAt) < new Date()) {
    response.status(410).json({ error: "Inbjudan är inte längre giltig" });
    return;
  }

  const account = await AccountModel.findOne({ id: invitation.accountId }, { _id: 0, __v: 0 });
  const role = await RoleModel.findOne({ id: invitation.roleId }, { _id: 0, __v: 0 });

  response.json({ invitation: invitation.toObject(), account, role });
});

const acceptSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    email: z.string().email(),
    password: z.string().min(8, "Lösenordet måste vara minst 8 tecken"),
    name: z.string().min(1)
  }),
  z.object({ action: z.literal("login"), email: z.string().email(), password: z.string() })
]);

invitationsRouter.post("/invitations/:token/accept", async (request, response) => {
  const invitation = await InvitationModel.findOne({ token: request.params.token });
  if (!invitation || invitation.status !== "pending") {
    response.status(410).json({ error: "Inbjudan är inte längre giltig" });
    return;
  }
  if (new Date(invitation.expiresAt) < new Date()) {
    invitation.status = "expired";
    await invitation.save();
    response.status(410).json({ error: "Inbjudan har gått ut" });
    return;
  }

  const body = validate(acceptSchema, request.body);

  let user = await UserModel.findOne({ email: body.email });

  if (body.action === "register") {
    if (user) {
      response.status(409).json({ error: "E-postadressen är redan registrerad, logga in istället" });
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
    if (!user) {
      response.status(401).json({ error: "Fel e-postadress eller lösenord" });
      return;
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      response.status(401).json({ error: "Fel e-postadress eller lösenord" });
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

  response.json({
    ok: true,
    memberId: member.id,
    accountId: invitation.accountId
  });
});
