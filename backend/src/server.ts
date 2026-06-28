import { app } from "./app.js";
import { connectDB } from "./db/connection.js";
import { CalendarModel } from "./db/models/Calendar.js";
import { MemberModel } from "./db/models/Member.js";
import { TodoModel } from "./db/models/Todo.js";
import { ShoppingListModel } from "./db/models/ShoppingList.js";
import { RewardModel } from "./db/models/Reward.js";
import { syncSubscription } from "./services/calendarsService.js";
import { logger } from "./utils/logger.js";

const PORT = process.env.PORT ?? 3000;

async function syncAllSubscriptions() {
  const calendars = await CalendarModel.find({ deletedAt: null });
  for (const cal of calendars) {
    for (const sub of cal.subscriptions ?? []) {
      await syncSubscription(cal.id, sub as any).catch((e) => logger.error(e));
    }
  }
}

async function backfillAccountIds() {
  const members = await MemberModel.find({});
  const byMemberId = new Map(members.map((m) => [m.get("id") as string, m.accountId]));

  const [todos, cals, lists, rewards] = await Promise.all([
    TodoModel.find({}),
    CalendarModel.find({}),
    ShoppingListModel.find({}),
    RewardModel.find({}),
  ]);

  let fixed = 0;

  for (const todo of todos) {
    const aid = byMemberId.get(todo.createdBy) ?? byMemberId.get(todo.assignedTo ?? "");
    if (aid && todo.accountId !== aid) {
      await TodoModel.updateOne({ id: todo.id }, { accountId: aid });
      fixed++;
    }
  }
  for (const cal of cals) {
    const aid = byMemberId.get(cal.ownerId);
    if (aid && cal.accountId !== aid) {
      await CalendarModel.updateOne({ id: cal.id }, { accountId: aid });
      fixed++;
    }
  }
  for (const list of lists) {
    const aid = byMemberId.get(list.ownerId);
    if (aid && list.accountId !== aid) {
      await ShoppingListModel.updateOne({ id: list.id }, { accountId: aid });
      fixed++;
    }
  }
  for (const reward of rewards) {
    const aid = byMemberId.get(reward.wishedBy);
    if (aid && reward.accountId !== aid) {
      await RewardModel.updateOne({ id: reward.id }, { accountId: aid });
      fixed++;
    }
  }

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
