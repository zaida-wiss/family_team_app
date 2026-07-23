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
  darkMode: { type: Boolean, default: undefined },
  calendarFilterSettings: { type: Schema.Types.Mixed, default: undefined },
  childTimelineSettings: { type: Schema.Types.Mixed, default: undefined },
  lastActivePanel: { type: String, default: undefined },
  lastSelectedDashboardMemberId: { type: String, default: null },
  calendarView: { type: String, default: undefined },
  todoViewMode: { type: String, default: undefined },
  todoThreadOrder: { type: [String], default: undefined },
  todoThreadRange: { type: String, default: undefined },
  spentStars: { type: Number, default: 0 },
  approvedStars: { type: Number, default: 0 },
  // Dela ett barns todos med en annan vuxen (ADR-0024, 2026-07-22) — se
  // shared/types.ts.
  childSharedWith: {
    type: [
      {
        memberId: { type: String, required: true },
        accountId: { type: String, required: true },
        access: { type: String, required: true },
        grantedBy: { type: String, required: true },
        grantedAt: { type: String, required: true }
      }
    ],
    default: []
  },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

export const MemberModel = model<Member>("Member", memberSchema);
