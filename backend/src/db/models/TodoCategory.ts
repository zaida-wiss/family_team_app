import { Schema, model } from "mongoose";
import type { TodoCategory } from "../../../../shared/types.js";

// Vuxenvyns personliga kategori-trådar (2026-07-05) — kontobred sedan ADR-0019
// (2026-07-07, alla vuxna ser/redigerar varandras). Sedan ADR-0020 (2026-07-08)
// samma system som driver belöningsbutikens kategori-spärr och barnens
// rutinskapare (ersätter det tidigare separata, fasta routineCategory-fältet).
const todoCategorySchema = new Schema<TodoCategory>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  memberId: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: String, required: true },
  hidden: { type: Boolean, default: false },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

todoCategorySchema.index({ accountId: 1, memberId: 1 });

export const TodoCategoryModel = model<TodoCategory>("TodoCategory", todoCategorySchema);
