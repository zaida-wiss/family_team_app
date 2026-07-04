import { AuditLogModel } from "../db/models/AuditLog.js";
import type { AuditLogAction } from "../../../shared/types.js";

export async function writeAuditLog(
  accountId: string,
  action: AuditLogAction,
  actorMemberId: string | null,
  summary: string
) {
  await AuditLogModel.create({
    id: `audit-${crypto.randomUUID()}`,
    accountId,
    action,
    actorMemberId,
    summary,
    createdAt: new Date().toISOString(),
  });
}

export async function getAuditLog(accountId: string, page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    AuditLogModel.find({ accountId }, { _id: 0, __v: 0 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
    AuditLogModel.countDocuments({ accountId }),
  ]);
  return { items, page, pageSize, total };
}
