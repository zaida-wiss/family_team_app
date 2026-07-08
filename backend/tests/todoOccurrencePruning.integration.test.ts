/**
 * Integrationstest (2026-07-08): automatisk mjuk-radering av gamla,
 * avslutade återkommande OCCURRENCES (pruneOldTodoOccurrences). Zaidas
 * önskemål: "det är ingen vits med att spara gamla avklarade kopior på en
 * todo som renderas och blir en ny kopia varje gång för varje person".
 * Mallen (recurringSourceId===null) och engångsuppgifter rörs aldrig.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { pruneOldTodoOccurrences } from "../src/services/todosService.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("pruneOldTodoOccurrences", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  const accountId = "account-prune-test";
  const baseTodo = {
    accountId,
    title: "Diska",
    createdBy: "mem-1",
    assignedTo: "mem-1",
    isShared: false,
    starValue: 0,
    visual: { type: "lucide-icon" as const, value: "Star" },
    recurrence: { type: "none" as const },
    occurrenceDate: null,
    visibleFrom: null,
    completedAt: null,
    approvedBy: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    deletedAt: null,
    deletedBy: null
  };

  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  it("tar bort en gammal godkänd OCCURRENCE, men rör aldrig mallen eller engångsuppgifter", async () => {
    await TodoModel.create([
      {
        ...baseTodo,
        id: "todo-old-approved-occurrence",
        recurringSourceId: "todo-template-1",
        status: "approved",
        approvedAt: daysAgo(10),
        expiresAt: daysAgo(10)
      },
      {
        ...baseTodo,
        id: "todo-recent-approved-occurrence",
        recurringSourceId: "todo-template-1",
        status: "approved",
        approvedAt: daysAgo(2),
        expiresAt: daysAgo(2)
      },
      {
        ...baseTodo,
        id: "todo-old-expired-occurrence",
        recurringSourceId: "todo-template-1",
        status: "expired",
        expiresAt: daysAgo(9)
      },
      {
        ...baseTodo,
        id: "todo-old-pending-occurrence",
        recurringSourceId: "todo-template-1",
        status: "pending",
        expiresAt: daysAgo(9)
      },
      {
        ...baseTodo,
        id: "todo-template-1",
        recurringSourceId: null,
        recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
        status: "pending",
        expiresAt: null
      },
      {
        ...baseTodo,
        id: "todo-old-one-off",
        recurringSourceId: null,
        status: "approved",
        approvedAt: daysAgo(30),
        expiresAt: daysAgo(30)
      }
    ]);

    const result = await pruneOldTodoOccurrences();
    expect(result.prunedCount).toBe(2);

    const docs = await TodoModel.find({ id: { $in: [
      "todo-old-approved-occurrence",
      "todo-recent-approved-occurrence",
      "todo-old-expired-occurrence",
      "todo-old-pending-occurrence",
      "todo-template-1",
      "todo-old-one-off"
    ] } }).lean();
    const deletedAtById = new Map(docs.map((d) => [d.id, d.deletedAt]));

    expect(deletedAtById.get("todo-old-approved-occurrence")).not.toBeNull();
    expect(deletedAtById.get("todo-old-expired-occurrence")).not.toBeNull();
    expect(deletedAtById.get("todo-recent-approved-occurrence")).toBeNull();
    expect(deletedAtById.get("todo-old-pending-occurrence")).toBeNull();
    expect(deletedAtById.get("todo-template-1")).toBeNull();
    expect(deletedAtById.get("todo-old-one-off")).toBeNull();
  });
});
