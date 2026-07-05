import { Schema, model } from "mongoose";
import type { Member } from "../../../../shared/types.js";

const memberSchema = new Schema<Member>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  userId: { type: String, default: null },
  name: { type: String, required: true },
  roleId: { type: String, required: true },
  isChild: { type: Boolean, required: true },
  avatarUrl: { type: String, default: null },
  color: { type: String, default: null },
  dashboardTheme: { type: String, default: null },
  calendarFilterSettings: { type: Schema.Types.Mixed, default: undefined },
  childTimelineSettings: { type: Schema.Types.Mixed, default: undefined },
  lastActivePanel: { type: String, default: undefined },
  lastSelectedDashboardMemberId: { type: String, default: null },
  calendarView: { type: String, default: undefined },
  todoViewMode: { type: String, default: undefined },
  spentStars: { type: Number, default: 0 },
  approvedStars: { type: Number, default: 0 },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

export const MemberModel = model<Member>("Member", memberSchema);
