/**
 * Engångsmigration: RewardShopItem.availability {daysOfWeek,timeIntervals} → {windows}
 *
 * Kör: tsx backend/scripts/migrateRewardShopAvailabilityWindows.ts
 *
 * Varför: 2026-08-29, Zaidas önskemål om flera olika tider för olika dagar
 * (t.ex. måndag 15-17, onsdag 18-20) — ShopAvailability byggdes om från en
 * platt {daysOfWeek, timeIntervals} till en lista av "fönster" (egna
 * daysOfWeek+timeIntervals per fönster, se ShopAvailabilityWindow i
 * shared/types.ts). Redan existerande produktionsvaror med
 * tillgänglighetsregler (tillagda 2026-08-28, Sprint 10 S1) har fortfarande
 * den gamla platta formen — appens kod har ingen läsväg kvar för den efter
 * denna ändring; en omigrerad vara skulle tolkas som "inga tidsbegränsningar
 * alls" (windows saknas → tolkas som tom array → alltid tillgänglig, se
 * isAvailableNow i shared/rewardShopAvailability.ts).
 *
 * Läser/skriver via den råa MongoDB-collectionen (inte Mongoose-modellen)
 * eftersom den gamla formen inte längre finns i itemSchema — Mongoose skulle
 * annars tyst strippa bort de gamla fälten vid vanlig find().
 *
 * Säkert att köra flera gånger — ett item vars availability redan har ett
 * `windows`-fält rörs inte.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { RewardShopModel } from "../src/db/models/RewardShop.js";

type OldAvailability = {
  startDate: string | null;
  endDate: string | null;
  daysOfWeek?: string[] | null;
  timeIntervals?: { start: string; end: string }[];
  windows?: unknown;
};

async function run() {
  await connectDB();

  const shops = await RewardShopModel.collection.find({}).toArray();
  let shopsUpdated = 0;
  let itemsMigrated = 0;

  for (const shop of shops) {
    let changed = false;
    const items = (shop.items ?? []).map((item: Record<string, unknown>) => {
      const av = item.availability as OldAvailability | null;
      if (!av || av.windows !== undefined) return item;

      const days = av.daysOfWeek ?? [];
      const intervals = av.timeIntervals ?? [];
      const windows = days.length > 0 || intervals.length > 0
        ? [{ daysOfWeek: days, timeIntervals: intervals }]
        : [];

      changed = true;
      itemsMigrated++;
      return {
        ...item,
        availability: { startDate: av.startDate, endDate: av.endDate, windows },
      };
    });

    if (changed) {
      await RewardShopModel.collection.updateOne({ _id: shop._id }, { $set: { items } });
      shopsUpdated++;
    }
  }

  console.log(`${itemsMigrated} varor i ${shopsUpdated} konton migrerade till windows-formen.`);
  console.log("Klart.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
