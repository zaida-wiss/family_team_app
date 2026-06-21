import { Schema, model } from "mongoose";
import type { Calendar } from "../../../../shared/types.js";

const calendarSchema = new Schema<Calendar>({
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
      notes: { type: String, default: null },
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
  ]
});

export const CalendarModel = model<Calendar>("Calendar", calendarSchema);
