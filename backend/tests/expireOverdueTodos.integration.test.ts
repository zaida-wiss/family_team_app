/**
 * Integrationstest (2026-08-05, Zaidas fynd om ansamlade dubblettkort i
 * Nathaniels vy): status:"expired" skrevs ALDRIG faktiskt till databasen —
 * useTodosState.ts:s expirePendingTodos() var en ren klientsidig
 * omräkning, aldrig ett PATCH-anrop. Konsekvens: pruneOldTodoOccurrences
 * (ADR-0022) och getAllTodos:s 30-dagarsfönster blev båda verkningslösa mot
 * en obesvarad återkommande occurrence — den ackumulerade en ny kopia PER
 * DAG utan gräns (ett bekräftat exempel: 30 obesvarade occurrences från
 * samma mall, sedan 25 juni). expireOverdueTodos() stänger den luckan.
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { expireOverdueTodos } from "../src/services/todosService.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("expireOverdueTodos", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  const accountId = "account-expire-test";
  const baseTodo = {
    accountId,
    title: "Diska",
    createdBy: "mem-1",
    assignedTo: "mem-1",
    isShared: false,
    starValue: 0,
    visual: { type: "lucide-icon" as const, value: "Star" },
    occurrenceDate: null,
    visibleFrom: null,
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
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

  function daysFromNow(n: number): string {
    return daysAgo(-n);
  }

  it("expirerar en förfallen pending OCCURRENCE och en förfallen pending ENGÅNGSUPPGIFT, men rör aldrig mallen, redan avslutade, framtida eller raderade", async () => {
    await TodoModel.create([
      {
        ...baseTodo,
        id: "todo-overdue-occurrence",
        recurringSourceId: "todo-template-1",
        recurrence: { type: "none" }, // occurrence: alltid "none", serie-fältet ligger på mallen
        status: "pending",
        expiresAt: daysAgo(1)
      },
      {
        ...baseTodo,
        id: "todo-overdue-one-off",
        recurringSourceId: null,
        recurrence: { type: "none" },
        status: "pending",
        expiresAt: daysAgo(1)
      },
      {
        ...baseTodo,
        id: "todo-template-1",
        recurringSourceId: null,
        recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
        status: "pending",
        // Mallens eget expiresAt är bara ankaret för dagens tidsfönster
        // (ofta ett datum långt bak i tiden, se ADR-0015) — ska ALDRIG
        // expireras, mallen ska finnas kvar för evigt.
        expiresAt: daysAgo(1000)
      },
      {
        ...baseTodo,
        id: "todo-future-occurrence",
        recurringSourceId: "todo-template-1",
        recurrence: { type: "none" },
        status: "pending",
        expiresAt: daysFromNow(1)
      },
      {
        ...baseTodo,
        id: "todo-already-approved",
        recurringSourceId: "todo-template-1",
        recurrence: { type: "none" },
        status: "approved",
        approvedAt: daysAgo(1),
        expiresAt: daysAgo(1)
      },
      {
        ...baseTodo,
        id: "todo-overdue-but-deleted",
        recurringSourceId: "todo-template-1",
        recurrence: { type: "none" },
        status: "pending",
        expiresAt: daysAgo(1),
        deletedAt: daysAgo(1),
        deletedBy: "mem-1"
      }
    ]);

    const result = await expireOverdueTodos();
    expect(result.expiredCount).toBe(2);

    const docs = await TodoModel.find({
      id: {
        $in: [
          "todo-overdue-occurrence",
          "todo-overdue-one-off",
          "todo-template-1",
          "todo-future-occurrence",
          "todo-already-approved",
          "todo-overdue-but-deleted"
        ]
      }
    }).lean();
    const statusById = new Map(docs.map((d) => [d.id, d.status]));

    expect(statusById.get("todo-overdue-occurrence")).toBe("expired");
    expect(statusById.get("todo-overdue-one-off")).toBe("expired");
    expect(statusById.get("todo-template-1")).toBe("pending");
    expect(statusById.get("todo-future-occurrence")).toBe("pending");
    expect(statusById.get("todo-already-approved")).toBe("approved");
    expect(statusById.get("todo-overdue-but-deleted")).toBe("pending");
  });
});
