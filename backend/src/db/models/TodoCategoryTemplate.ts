import { Schema, model } from "mongoose";
import type { TodoCategoryTemplate } from "../../../../shared/types.js";

// Hel kategori sparad som mall (2026-07-08, Zaidas önskemål: t.ex. en
// packlista) — bäddar in frusna kopior av uppgifterna direkt, oberoende av
// det separata TodoTemplate-biblioteket (enskilda uppgiftsmallar).
const taskSchema = {
  title: { type: String, required: true },
  visual: {
    type: { type: String, enum: ["lucide-icon", "image"], required: true },
    // Se Todo.ts:s motsvarande kommentar (2026-08-07) — tom sträng =
    // "ingen ikon vald", inte "saknat värde".
    value: { type: String, default: "" }
  },
  // Se TodoTemplate.ts:s motsvarande kommentar (2026-07-27).
  notes: { type: String, default: null },
  subtasks: {
    type: [{ title: { type: String, required: true }, timedMinutes: { type: Number, default: null } }],
    default: []
  },
  recurrence: { type: Schema.Types.Mixed, required: true },
  starValue: { type: Number, required: true },
  // Tidtagning (2026-08-06) — se TodoTemplate.ts:s motsvarande kommentar.
  timerEnabled: { type: Boolean, default: false },
  plannedDurationMinutes: { type: Number, default: null }
};

const todoCategoryTemplateSchema = new Schema<TodoCategoryTemplate>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  memberId: { type: String, required: true },
  name: { type: String, required: true },
  tasks: { type: [taskSchema], required: true },
  createdAt: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null },
  // 2026-07-28 — se shared/types.ts:s kommentar. Måste läggas till HÄR (inte
  // bara i Zod-schemat) samma dag som fältet införs, annars strippas det
  // tyst av Mongoose strict-läge (samma bugklass som todoThreadGap-incidenten).
  sourceCategoryId: { type: String, default: null }
});

todoCategoryTemplateSchema.index({ accountId: 1 });

export const TodoCategoryTemplateModel = model<TodoCategoryTemplate>(
  "TodoCategoryTemplate",
  todoCategoryTemplateSchema
);
