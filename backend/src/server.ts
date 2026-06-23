import { app } from "./app.js";
import { connectDB } from "./db/connection.js";
import { CalendarModel } from "./db/models/Calendar.js";
import { syncSubscription } from "./services/calendarsService.js";

const PORT = process.env.PORT ?? 3000;

async function syncAllSubscriptions() {
  const calendars = await CalendarModel.find({ deletedAt: null });
  for (const cal of calendars) {
    for (const sub of cal.subscriptions ?? []) {
      await syncSubscription(cal.id, sub as any).catch(console.error);
    }
  }
}

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Servern lyssnar på port ${PORT}`);
  });
  // Sync all subscriptions every hour
  setInterval(() => { syncAllSubscriptions().catch(console.error); }, 60 * 60 * 1000);
}

start().catch(console.error);
