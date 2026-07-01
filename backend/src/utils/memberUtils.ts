import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "./errors.js";

async function assertAccountActive(accountId: string) {
  // Ett konto som väntar på GDPR-radering (deleteAccount, ADR-0007) ska ge omedelbar
  // åtkomstförlust för alla medlemmar, även om den faktiska datan inte hard-raderas
  // förrän gallringsfönstret (30 dagar) löpt ut och purgeExpiredAccounts körts.
  const account = await AccountModel.findOne({ id: accountId }, { deletedAt: 1, _id: 0 });
  if (!account || account.deletedAt) throw new AppError(403, "Kontot är borttaget");
}

export async function accountIdOf(memberId: string | undefined, userId?: string): Promise<string> {
  if (memberId) {
    const member = await MemberModel.findOne({ id: memberId, deletedAt: null });
    if (member) {
      if (userId && member.userId !== userId) {
        // memberId tillhör en annan användare (t.ex. barn utan eget login).
        // Verifiera att den autentiserade användaren är med i samma konto.
        const isSameAccount = await MemberModel.exists({
          userId,
          accountId: member.accountId,
          deletedAt: null,
        });
        if (!isSameAccount) throw new AppError(403, "Åtkomst nekad");
      }
      await assertAccountActive(member.accountId);
      return member.accountId;
    }
  }
  if (userId) {
    const member = await MemberModel.findOne({ userId, deletedAt: null });
    if (member) {
      await assertAccountActive(member.accountId);
      return member.accountId;
    }
  }
  throw new AppError(401, "Okänd användare");
}
