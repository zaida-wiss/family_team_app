import { Schema, model } from "mongoose";
import type { Account } from "../../../../shared/types.js";

const calendarSettingsSchema = new Schema({
  showWeekNumbers: { type: Boolean, default: false },
  showHolidays: { type: Boolean, default: true },
  holidayBgColor: { type: String, default: "#ffe4e6" },
  holidayTextColor: { type: String, default: "#9f1239" },
  subscriptionUrl: { type: String, default: null }
}, { _id: false });

const accountSchema = new Schema<Account>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ["family"], required: true },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  calendarSettings: { type: calendarSettingsSchema, default: undefined }
});

export const AccountModel = model<Account>("Account", accountSchema);
