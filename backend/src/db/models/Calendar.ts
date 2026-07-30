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
    displaySymbol: { type: String, default: null },
    syncIntervalMinutes: { type: Number, default: 60 }
  },
  { id: false }
);

const calDavConnectionSchema = new Schema(
  {
    id: { type: String, required: true },
    calendarId: { type: String, required: true },
    provider: { type: String, required: true },
    // 2026-07-30: refererar ett AppleCalDavAccount istället för att bära
    // egna inloggningsuppgifter — se AppleCalDavAccount.ts.
    appleAccountId: { type: String, required: true },
    externalCalendarHref: { type: String, required: true },
    syncIntervalMinutes: { type: Number, default: 15 },
    lastSyncedAt: { type: String, default: null },
    lastSyncError: { type: String, default: null },
    createdBy: { type: String, required: true },
    connectedAt: { type: String, required: true }
  },
  { id: false }
);

const calendarSchema = new Schema<Calendar>(
  {
    id: { type: String, required: true, unique: true },
    accountId: { type: String, default: null },
    name: { type: String, required: true },
    color: { type: String, required: true },
    ownerId: { type: String, required: true },
    sharedWith: [{ memberId: String, access: String }],
    deletedAt: { type: String, default: null },
    deletedBy: { type: String, default: null },
    keepAllHistory: { type: Boolean, default: false },
    // "Mina familjekonton" (2026-07-30) — synlig bara för samma person i
    // deras andra konton, se shared/types.ts:s kommentar.
    shareAcrossMyAccounts: { type: Boolean, default: false },
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
        symbol: { type: String, default: null },
        createdBy: { type: String, required: true },
        deletedAt: { type: String, default: null },
        deletedBy: { type: String, default: null },
        calDavEtag: { type: String, default: null },
        calDavHref: { type: String, default: null }
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
    subscriptions: [subscriptionSchema],
    calDavConnections: [calDavConnectionSchema]
  },
  { id: false }
);

export const CalendarModel = model<Calendar>("Calendar", calendarSchema);
