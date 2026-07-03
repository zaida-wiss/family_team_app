import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import { AnalyticsEventModel } from "../db/models/AnalyticsEvent.js";
import { MemberModel } from "../db/models/Member.js";

export const analyticsRouter = Router();

const ALLOWED_EVENTS = new Set([
  "todo-completed",
  "todo-approved",
  "calendar-event-added",
  "reward-redeemed",
  "wish-created",
  "wish-approved",
  "login",
  "shopping-item-checked",
]);

const trackSchema = z.object({
  event: z.string().refine((e) => ALLOWED_EVENTS.has(e), { message: "Okänd händelse" }),
});

analyticsRouter.post("/track", requireAuth, attachAccountId, async (req, res) => {
  const { event } = trackSchema.parse(req.body);
  const member = await MemberModel.findOne({ id: req.memberId });
  const role = member?.isChild ? "child" : "parent";

  await AnalyticsEventModel.create({
    id: `evt-${crypto.randomUUID()}`,
    accountId: req.accountId!,
    event,
    role,
    timestamp: new Date().toISOString(),
  });

  res.json({ ok: true });
});

analyticsRouter.get("/summary", requireAuth, attachAccountId, async (req, res) => {
  const accountId = req.accountId!;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString();

  const [allEvents, recentEvents] = await Promise.all([
    AnalyticsEventModel.find({ accountId }).lean(),
    AnalyticsEventModel.find({ accountId, timestamp: { $gte: cutoff } }).lean(),
  ]);

  const eventCounts: Record<string, number> = {};
  const byRole: Record<string, number> = {};
  for (const ev of allEvents) {
    eventCounts[ev.event] = (eventCounts[ev.event] ?? 0) + 1;
    byRole[ev.role] = (byRole[ev.role] ?? 0) + 1;
  }

  res.json({
    totalEvents: allEvents.length,
    eventCounts,
    byRole,
    last7Days: recentEvents.length,
  });
});
