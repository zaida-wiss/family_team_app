import { Schema, model } from "mongoose";
import type { Todo } from "../../../../shared/types.js";

const todoSchema = new Schema<Todo>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, default: null },
  title: { type: String, required: true },
  createdBy: { type: String, required: true },
  assignedTo: { type: String, default: null },
  isShared: { type: Boolean, required: true },
  status: { type: String, enum: ["pending", "done", "approved", "rejected", "expired"], required: true },
  starValue: { type: Number, required: true },
  visual: {
    type: { type: String, enum: ["lucide-icon", "image"], required: true },
    value: { type: String, required: true }
  },
  recurrence: { type: Schema.Types.Mixed, required: true },
  recurringSourceId: { type: String, default: null },
  occurrenceDate: { type: String, default: null },
  visibleFrom: { type: String, default: null },
  expiresAt: { type: String, default: null },
  completedAt: { type: String, default: null },
  approvedBy: { type: String, default: null },
  approvedAt: { type: String, default: null },
  rejectedBy: { type: String, default: null },
  rejectedAt: { type: String, default: null },
  rejectedReason: { type: String, default: null },
  // Fritextanteckningar (2026-07-05) — krypterat som title/rejectedReason (ADR-0014).
  notes: { type: String, default: null },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null },
  routineCategory: { type: String, default: null },
  // Vuxenvyns egna, personliga kategori-trådar (2026-07-05) — helt separat från
  // routineCategory/ROUTINE_CATEGORIES ovan, som fortsatt driver belöningsbutikens
  // kategori-spärr och barnens rutinskapare oförändrat.
  personalCategoryId: { type: String, default: null },
  subtasks: {
    type: [
      {
        id: { type: String, required: true },
        title: { type: String, required: true },
        done: { type: Boolean, required: true }
      }
    ],
    default: undefined
  },
  // Flera tidsintervall per dag på samma återkommande mall (2026-07-05) —
  // valfritt, bakåtkompatibelt (recurringTodos.ts faller tillbaka på
  // visibleFrom/expiresAt direkt när fältet saknas).
  timeWindows: {
    type: [
      {
        visibleFrom: { type: String, default: null },
        expiresAt: { type: String, default: null }
      }
    ],
    default: undefined
  }
});

export const TodoModel = model<Todo>("Todo", todoSchema);
