import { MemberModel } from "../db/models/Member.js";
import { AppError } from "./errors.js";

export async function accountIdOf(memberId: string | undefined, userId?: string): Promise<string> {
  if (memberId) {
    const member = await MemberModel.findOne({ id: memberId, deletedAt: null });
    if (member) return member.accountId;
  }
  if (userId) {
    const member = await MemberModel.findOne({ userId, deletedAt: null });
    if (member) return member.accountId;
  }
  throw new AppError(401, "Okänd användare");
}
