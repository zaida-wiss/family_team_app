import { app } from "./app.js";
import { connectDB } from "./db/connection.js";
import { CalendarModel } from "./db/models/Calendar.js";
import { MemberModel } from "./db/models/Member.js";
import { TodoModel } from "./db/models/Todo.js";
import { ShoppingListModel } from "./db/models/ShoppingList.js";
import { RewardModel } from "./db/models/Reward.js";
import { syncSubscription } from "./services/calendarSubscriptionsService.js";
import { pullConnection } from "./services/appleCalDavService.js";
import { pruneOldTodoOccurrences } from "./services/todosService.js";
import { logger } from "./utils/logger.js";

const PORT = process.env.PORT ?? 3000;

// Tick:ar var 5:e minut (den snabbaste valbara intervallen, se
// SYNC_INTERVAL_OPTIONS i calendarSubscriptionsService.ts) men synkar bara
// prenumerationer vars EGET intervall faktiskt gått ut — 2026-07-24, Zaidas
// önskemål om konfigurerbar synkfrekvens (tidigare hårdkodat en gång/timme
// för alla, oavsett val).
async function syncAllSubscriptions() {
  const now = Date.now();
  const calendars = await CalendarModel.find({ deletedAt: null, accountId: { $ne: null } });
  for (const cal of calendars) {
    for (const sub of cal.subscriptions ?? []) {
      const s = sub as any;
      const intervalMs = (s.syncIntervalMinutes ?? 60) * 60 * 1000;
      const due = !s.lastSyncedAt || now - new Date(s.lastSyncedAt).getTime() >= intervalMs;
      if (!due) continue;
      await syncSubscription(cal.id, cal.accountId!, s).catch((e) => logger.error(e));
    }
    for (const conn of (cal as any).calDavConnections ?? []) {
      const intervalMs = (conn.syncIntervalMinutes ?? 15) * 60 * 1000;
      const due = !conn.lastSyncedAt || now - new Date(conn.lastSyncedAt).getTime() >= intervalMs;
      if (!due) continue;
      await pullConnection(cal.id, cal.accountId!, conn).catch((e) => logger.error(e));
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
  setInterval(() => { syncAllSubscriptions().catch((e) => logger.error(e)); }, 5 * 60 * 1000);
  // Dagligen räcker gott och väl för en 1-veckas-gräns (2026-07-08).
  setInterval(() => { pruneOldTodoOccurrences().catch((e) => logger.error(e)); }, 24 * 60 * 60 * 1000);
}

start().catch((e) => logger.error(e));
