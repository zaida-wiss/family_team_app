import { Schema, model } from "mongoose";
import type { TodoTemplate } from "../../../../shared/types.js";

// Fristående uppgiftsmall (2026-07-08, Zaidas önskemål: kunna spara en
// enskild återkommande eller engångsuppgift som en återanvändbar mall,
// oberoende av kategori) — se docs/engineering-os/.../decisions/ för ADR.
const todoTemplateSchema = new Schema<TodoTemplate>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  memberId: { type: String, required: true },
  title: { type: String, required: true },
  visual: {
    type: { type: String, enum: ["lucide-icon", "image"], required: true },
    value: { type: String, required: true }
  },
  subtasks: {
    type: [{ title: { type: String, required: true } }],
    default: []
  },
  recurrence: { type: Schema.Types.Mixed, required: true },
  starValue: { type: Number, required: true },
  createdAt: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

todoTemplateSchema.index({ accountId: 1 });

export const TodoTemplateModel = model<TodoTemplate>("TodoTemplate", todoTemplateSchema);
