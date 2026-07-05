import { Schema, model } from "mongoose";
import type { TodoCategory } from "../../../../shared/types.js";

// Vuxenvyns personliga kategori-trådar (2026-07-05) — ägs av en enskild medlem,
// inte delade med resten av kontot. Separat från routineCategory (fasta
// kategorier som driver belöningsbutikens kategori-spärr och barnens rutiner).
const todoCategorySchema = new Schema<TodoCategory>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  memberId: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: String, required: true },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

todoCategorySchema.index({ accountId: 1, memberId: 1 });

export const TodoCategoryModel = model<TodoCategory>("TodoCategory", todoCategorySchema);
