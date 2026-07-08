import { Schema, model } from "mongoose";
import type { TodoCategoryTemplate } from "../../../../shared/types.js";

// Hel kategori sparad som mall (2026-07-08, Zaidas önskemål: t.ex. en
// packlista) — bäddar in frusna kopior av uppgifterna direkt, oberoende av
// det separata TodoTemplate-biblioteket (enskilda uppgiftsmallar).
const taskSchema = {
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
  starValue: { type: Number, required: true }
};

const todoCategoryTemplateSchema = new Schema<TodoCategoryTemplate>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  memberId: { type: String, required: true },
  name: { type: String, required: true },
  tasks: { type: [taskSchema], required: true },
  createdAt: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

todoCategoryTemplateSchema.index({ accountId: 1 });

export const TodoCategoryTemplateModel = model<TodoCategoryTemplate>(
  "TodoCategoryTemplate",
  todoCategoryTemplateSchema
);
