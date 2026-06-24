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
  visibleCalendarIds: { type: [String], default: undefined },
  lastActivePanel: { type: String, default: undefined },
  lastSelectedDashboardMemberId: { type: String, default: null },
  calendarView: { type: String, default: undefined },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

export const MemberModel = model<Member>("Member", memberSchema);
