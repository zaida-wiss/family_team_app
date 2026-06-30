import { Schema, model } from "mongoose";

export type AnalyticsEventDoc = {
  id: string;
  accountId: string;
  event: string;
  role: string;
  timestamp: string;
};

const analyticsEventSchema = new Schema<AnalyticsEventDoc>({
  id:        { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  event:     { type: String, required: true },
  role:      { type: String, required: true },
  timestamp: { type: String, required: true },
});

analyticsEventSchema.index({ accountId: 1 });
analyticsEventSchema.index({ event: 1 });
analyticsEventSchema.index({ timestamp: -1 });

export const AnalyticsEventModel = model<AnalyticsEventDoc>("AnalyticsEvent", analyticsEventSchema);
