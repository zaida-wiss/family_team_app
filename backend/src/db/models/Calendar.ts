import { Schema, model } from "mongoose";
import type { Calendar } from "../../../../shared/types.js";

const subscriptionSchema = new Schema(
  {
    id: { type: String, required: true },
    calendarId: { type: String, required: true },
    url: { type: String, required: true },
    includeWords: [{ type: String }],
    excludeWords: [{ type: String }],
    dateFrom: { type: String, default: null },
    dateTo: { type: String, default: null },
    lastSyncedAt: { type: String, default: null },
    displaySymbol: { type: String, default: null }
  },
  { id: false }
);

const calendarSchema = new Schema<Calendar>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    color: { type: String, required: true },
    ownerId: { type: String, required: true },
    sharedWith: [{ memberId: String, access: String }],
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
    events: [
      {
        id: { type: String, required: true },
        calendarId: { type: String, required: true },
        title: { type: String, required: true },
        startsAt: { type: String, required: true },
        endsAt: { type: String, required: true },
        isAllDay: { type: Boolean, default: false },
        color: { type: String, default: null },
        uid: { type: String, default: null },
        subscriptionId: { type: String, default: null },
        location: { type: String, default: null },
        notes: { type: String, default: null },
        recurrence: {
          type: { type: String, default: "none" },
          interval: { type: Number, default: 1 },
          until: { type: String, default: null }
        },
        attendees: [{ memberId: String, status: String }],
        createdBy: { type: String, required: true },
        deletedAt: { type: String, default: null },
        deletedBy: { type: String, default: null }
      }
    ],
    importedSources: [
      {
        id: { type: String, required: true },
        type: { type: String, required: true },
        name: { type: String, required: true },
        importedAt: { type: String, required: true }
      }
    ],
    subscriptions: [subscriptionSchema]
  },
  { id: false }
);

export const CalendarModel = model<Calendar>("Calendar", calendarSchema);
