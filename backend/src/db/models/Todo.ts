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
  // Revisionsstämplar (2026-08-05) — createdAt sätts explicit i createTodo
  // (todosService.ts), default här är bara en självläkande reservlösning för
  // redan existerande dokument (samma mönster som Recipe.ts:s createdAt-fix
  // 2026-07-26 — Mongoose applicerar defaulten vid HYDRERING också, inte bara
  // create()). updatedAt hålls alltid aktuell via pre("save") nedan — täcker
  // samtliga ~18 .save()-anrop i todosService.ts utan att behöva sätta den
  // manuellt i varje enskild funktion (samma klass av "glömdes i en av flera
  // funktioner"-bugg som todoThreadGap-incidenten redan visat risken med).
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
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
  // Kontobred, fritt namngiven kategori (2026-07-05) — sedan ADR-0020
  // (2026-07-08) det ENDA kategorisystemet, ersätter det tidigare separata,
  // fasta routineCategory-fältet (borttaget ur schemat här, men befintliga
  // dokuments råa fält rörs inte av detta — se
  // migrateRoutineCategoryToPersonalCategory.ts för migreringen).
  personalCategoryId: { type: String, default: null },
  subtasks: {
    type: [
      {
        id: { type: String, required: true },
        title: { type: String, required: true },
        done: { type: Boolean, required: true },
        // Delmoment-tilldelning (2026-07-23) — se TodoSubtask i shared/types.ts.
        assignedTo: { type: String, default: null },
        // Recept-integration (2026-07-25, ADR-0028) — se TodoSubtask i shared/types.ts.
        timedMinutes: { type: Number, default: null },
        timerStartedAt: { type: String, default: null }
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
  },
  // Timerfunktion (2026-07-07) — helt separat, enklare system än
  // TimedTask/TimedAttempt (Medaljer/Rekord): en enda inspelad tid per
  // uppgift, ingen personbästa-jämförelse.
  timerEnabled: { type: Boolean, default: undefined },
  plannedDurationMinutes: { type: Number, default: null },
  elapsedMs: { type: Number, default: null },
  // "Någon håller på med den här"-indikator (2026-07-22) — se shared/types.ts.
  inProgressBy: { type: [String], default: [] },
  inProgressSince: { type: String, default: null }
});

// Saknades tidigare helt (2026-07-08, Zaidas fynd: todos laddas segt) — till
// skillnad från nästan alla andra modeller i appen (Role/TodoCategory/
// TimedTask/AuditLog/PurchasedReward har redan sitt eget accountId-index).
// getAllTodos() filtrerar alltid på accountId högst upp i frågan — utan
// index scannar MongoDB annars hela collection:en (alla konton) varje gång.
todoSchema.index({ accountId: 1 });

// Sätter updatedAt på VARJE save() — täcker complete/approve/reject/update/
// toggleSubtask/toggleInProgress/unassignSelf/softDelete/restore m.fl. i ett
// enda ställe, istället för att riskera att missa en (se kommentar ovan).
// Skriver alltid över — även om ett patch-anrop av misstag skulle innehålla
// updatedAt (går inte idag, TodoPatchSchema exkluderar det) vinner hooken.
todoSchema.pre("save", function (next) {
  this.updatedAt = new Date().toISOString();
  next();
});

export const TodoModel = model<Todo>("Todo", todoSchema);
