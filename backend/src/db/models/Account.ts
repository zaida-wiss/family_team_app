import { Schema, model } from "mongoose";
import type { Account } from "../../../../shared/types.js";

const calendarSettingsSchema = new Schema({
  showWeekNumbers: { type: Boolean, default: false },
  showHolidays: { type: Boolean, default: true },
  holidayBgColor: { type: String, default: "#ffe4e6" },
  holidayTextColor: { type: String, default: "#9f1239" },
  subscriptionUrl: { type: String, default: null }
}, { _id: false });

const familyConnectionScopeSchema = new Schema({
  todos: { type: Boolean, default: true },
  recipes: { type: Boolean, default: true },
  shoppingLists: { type: Boolean, default: true }
}, { _id: false });

// Familjeanslutningar (ADR-0030, 2026-07-29) — tillagd i Mongoose-schemat
// SAMTIDIGT som shared/types.ts, inte i en efterföljande commit (se
// todoThreadGap-incidentens kommentar, 2026-07-28, för varför det spelar
// roll).
const familyConnectionSchema = new Schema({
  id: { type: String, required: true },
  otherAccountId: { type: String, required: true },
  status: { type: String, enum: ["pending", "accepted"], required: true },
  invitedBy: { type: String, required: true },
  createdAt: { type: String, required: true },
  exposedMemberIds: { type: [String], default: [] },
  access: { type: String, enum: ["view", "edit"], required: true },
  dataScope: { type: familyConnectionScopeSchema, default: () => ({}) }
}, { _id: false });

const accountSchema = new Schema<Account>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ["family"], required: true },
  createdBy: { type: String, required: true },
  deletedAt: { type: String, default: null },
  calendarSettings: { type: calendarSettingsSchema, default: undefined },
  fixedTodoTimes: { type: Boolean, default: false },
  defaultRecipeShoppingListId: { type: String, default: null },
  familyConnections: { type: [familyConnectionSchema], default: [] }
});

export const AccountModel = model<Account>("Account", accountSchema);
