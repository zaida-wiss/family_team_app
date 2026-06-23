import { MemberModel } from "../db/models/Member.js";
import { AppError } from "../utils/errors.js";

export async function getAllMembers() {
  return MemberModel.find({}, { _id: 0, __v: 0 });
}

export async function createMember(data: unknown) {
  const member = new MemberModel(data);
  await member.save();
  return { id: member.id };
}

export async function updateMember(id: string, patch: unknown) {
  const member = await MemberModel.findOne({ id });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  Object.assign(member, patch);
  await member.save();
}

export async function deleteMember(id: string, memberId: string | null) {
  const member = await MemberModel.findOne({ id });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  member.deletedAt = new Date().toISOString();
  member.deletedBy = memberId;
  await member.save();
}

export async function restoreMember(id: string) {
  const member = await MemberModel.findOne({ id });
  if (!member) {
    throw new AppError(404, "Medlem hittades inte");
  }
  member.deletedAt = null;
  member.deletedBy = null;
  await member.save();
}
