import { Schema, model } from "mongoose";
import type { TimedTask } from "../../../../shared/types.js";

const timedTaskSchema = new Schema<TimedTask>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  title: { type: String, required: true },
  symbol: { type: String, default: null },
  assignedTo: { type: String, required: true },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

timedTaskSchema.index({ accountId: 1, assignedTo: 1 });

export const TimedTaskModel = model<TimedTask>("TimedTask", timedTaskSchema);
