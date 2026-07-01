import { MemberModel } from "../db/models/Member.js";
import { AppError } from "../utils/errors.js";
import { CreateMemberBodySchema, MemberPatchSchema } from "../../../shared/schemas.js";

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
