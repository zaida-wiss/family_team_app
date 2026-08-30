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
  // Dölj i familjens veckoöversikt (2026-08-30) — måste läggas till HÄR
  // samma dag som fältet införs i shared/types.ts, annars strippas det tyst
  // av Mongoose strict-läge (samma bugklass som todoThreadGap-incidenten).
  excludeFromWeekOverview: { type: Boolean, default: false },
  // Familjekategori (2026-08-03) — se shared/types.ts:s kommentar.
  isFamily: { type: Boolean, default: false },
  // Auto-samlingskategori (2026-08-06) — måste läggas till HÄR samma dag
  // som fältet införs, annars strippas det tyst av Mongoose strict-läge
  // (samma bugklass som todoThreadGap-incidenten). Se shared/types.ts.
  isUncategorizedCollector: { type: Boolean, default: false },
  // Delning mellan familjer (2026-08-06) — måste läggas till HÄR samma dag
  // som fältet införs i shared/types.ts, annars strippas det tyst av
  // Mongoose strict-läge (samma bugklass som todoThreadGap-incidenten).
  externalSharedWith: {
    type: [
      {
        memberId: { type: String, required: true },
        accountId: { type: String, required: true },
        access: { type: String, required: true },
        grantedBy: { type: String, required: true },
        grantedAt: { type: String, required: true }
      }
    ],
    default: []
  },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null }
});

todoCategorySchema.index({ accountId: 1, memberId: 1 });

export const TodoCategoryModel = model<TodoCategory>("TodoCategory", todoCategorySchema);
