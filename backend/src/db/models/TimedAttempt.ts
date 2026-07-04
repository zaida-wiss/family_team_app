import { Schema, model } from "mongoose";
import type { TimedAttempt } from "../../../../shared/types.js";

const timedAttemptSchema = new Schema<TimedAttempt>({
  id: { type: String, required: true, unique: true },
  timedTaskId: { type: String, required: true },
  memberId: { type: String, required: true },
  durationMs: { type: Number, required: true },
  achievedAt: { type: String, required: true },
  isNewRecord: { type: Boolean, required: true }
});

timedAttemptSchema.index({ timedTaskId: 1, memberId: 1 });

export const TimedAttemptModel = model<TimedAttempt>("TimedAttempt", timedAttemptSchema);
