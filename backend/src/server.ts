import { app } from "./app.js";
import { connectDB } from "./db/connection.js";
import { CalendarModel } from "./db/models/Calendar.js";
import { MemberModel } from "./db/models/Member.js";
import { TodoModel } from "./db/models/Todo.js";
import { ShoppingListModel } from "./db/models/ShoppingList.js";
import { RewardModel } from "./db/models/Reward.js";
import { syncSubscription } from "./services/calendarSubscriptionsService.js";
import { logger } from "./utils/logger.js";

const PORT = process.env.PORT ?? 3000;

async function syncAllSubscriptions() {
  const calendars = await CalendarModel.find({ deletedAt: null, accountId: { $ne: null } });
  for (const cal of calendars) {
    for (const sub of cal.subscriptions ?? []) {
      await syncSubscription(cal.id, cal.accountId!, sub as any).catch((e) => logger.error(e));
    }
  }
}

async function backfillCollection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Model: any,
  ownerFields: string[],
  byMemberId: Map<string, string>
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs: any[] = await Model.find({});
  let fixed = 0;
  for (const doc of docs) {
    const aid = ownerFields.map((f) => byMemberId.get(doc[f] ?? "")).find(Boolean);
    if (aid && doc.accountId !== aid) {
      await Model.updateOne({ id: doc.id }, { accountId: aid });
      fixed++;
    }
  }
  return fixed;
}

async function backfillAccountIds() {
  const members = await MemberModel.find({});
  const byMemberId = new Map(members.map((m) => [m.get("id") as string, m.accountId]));

  const counts = await Promise.all([
    backfillCollection(TodoModel,         ["createdBy", "assignedTo"], byMemberId),
    backfillCollection(CalendarModel,     ["ownerId"],                 byMemberId),
    backfillCollection(ShoppingListModel, ["ownerId"],                 byMemberId),
    backfillCollection(RewardModel,       ["wishedBy"],                byMemberId),
  ]);
  const fixed = counts.reduce((a, b) => a + b, 0);
  if (fixed > 0) logger.info(`Migrering: accountId korrigerat på ${fixed} dokument`);
}

async function start() {
  await connectDB();
  await backfillAccountIds();
  app.listen(PORT, () => {
    logger.info(`Servern lyssnar på port ${PORT}`);
  });
  setInterval(() => { syncAllSubscriptions().catch((e) => logger.error(e)); }, 60 * 60 * 1000);
}

start().catch((e) => logger.error(e));
