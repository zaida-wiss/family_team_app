import bcrypt from "bcryptjs";
import crypto from "crypto";
import { MemberModel } from "../db/models/Member.js";
import { UserModel, setChildCredentialsSchema } from "../db/models/User.js";
import { AppError } from "../utils/errors.js";
import { CreateMemberBodySchema, MemberPatchSchema } from "../../../shared/schemas.js";
import { getAllRoles } from "./rolesService.js";
import { hasPermission } from "../../../shared/permissions.js";

export async function getAllMembers(accountId: string) {
  return MemberModel.find({ accountId }, { _id: 0, __v: 0 });
}

// accountId, userId, spentStars, approvedStars, deletedAt, deletedBy sätts alltid
// här — aldrig litat på från klientens body (se CreateMemberBodySchema).
export async function createMember(accountId: string, data: unknown) {
  const patch = CreateMemberBodySchema.parse(data);
  const member = new MemberModel({
    id: `member-${crypto.randomUUID()}`,
    accountId,
    userId: null,
    ...patch,
    spentStars: 0,
    approvedStars: 0,
    deletedAt: null,
    deletedBy: null
  });
  await member.save();
  return { id: member.id };
}

export async function updateMember(id: string, accountId: string, data: unknown) {
  const patch = MemberPatchSchema.parse(data);
  const member = await MemberModel.findOne({ id, accountId });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  Object.assign(member, patch);
  await member.save();
}

export async function deleteMember(id: string, accountId: string, memberId: string | null) {
  const member = await MemberModel.findOne({ id, accountId });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  member.deletedAt = new Date().toISOString();
  member.deletedBy = memberId;
  await member.save();
}

export async function restoreMember(id: string, accountId: string) {
  const member = await MemberModel.findOne({ id, accountId });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  member.deletedAt = null;
  member.deletedBy = null;
  await member.save();
}

// Barn-inloggning (2026-07-22) — en förälder sätter/ändrar ett barns
// användarnamn+lösenord. Skapar barnets User första gången (Member.userId
// är null tills dess, precis som idag), uppdaterar samma User vid ändring.
// username är bara unikt INOM familjen (kontrolleras här, inte i databasen —
// User.username har inget unikt index eftersom det inte är globalt unikt),
// se authService.ts:s childLogin för hur inloggningen sedan hittar rätt
// familj via förälderns e-post.
export async function setChildCredentials(
  accountId: string,
  callerMemberId: string | null,
  childMemberId: string,
  data: unknown
) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const roles = await getAllRoles(accountId);
  if (!hasPermission(caller, roles, "canManageMembers")) {
    throw new AppError(403, "Åtkomst nekad");
  }

  const child = await MemberModel.findOne({ id: childMemberId, accountId, deletedAt: null });
  if (!child || !child.isChild) {
    throw new AppError(404, "Barnet hittades inte");
  }

  const { username, password } = setChildCredentialsSchema.parse(data);
  const normalizedUsername = username.toLowerCase();

  const siblingChildren = await MemberModel.find({
    accountId,
    isChild: true,
    deletedAt: null,
    id: { $ne: childMemberId }
  });
  const siblingUserIds = siblingChildren
    .map((m) => m.userId)
    .filter((id): id is string => id !== null);
  if (siblingUserIds.length > 0) {
    const clash = await UserModel.findOne({ id: { $in: siblingUserIds }, username: normalizedUsername });
    if (clash) {
      throw new AppError(409, "Användarnamnet är redan taget av ett annat barn i familjen");
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  if (child.userId) {
    const existingUser = await UserModel.findOne({ id: child.userId });
    if (!existingUser) {
      throw new AppError(404, "Användaren hittades inte");
    }
    existingUser.username = normalizedUsername;
    existingUser.passwordHash = passwordHash;
    existingUser.tokenVersion += 1; // Loggar ut alla befintliga sessioner vid lösenordsbyte
    await existingUser.save();
    return { id: existingUser.id, username: normalizedUsername };
  }

  const newUser = new UserModel({
    id: `user-${crypto.randomUUID()}`,
    email: null,
    username: normalizedUsername,
    passwordHash,
    name: child.name,
    createdAt: new Date().toISOString(),
    tokenVersion: 0
  });
  await newUser.save();
  child.userId = newUser.id;
  await child.save();
  return { id: newUser.id, username: normalizedUsername };
}
