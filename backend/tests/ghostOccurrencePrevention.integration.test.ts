/**
 * Integrationstest (2026-08-05, Zaidas önskemål: "spökkod till borttagna
 * mallar alltid försvinner med mallen"): createTodo vägrar nu spara en
 * occurrence (recurringSourceId satt) vars mall inte finns eller redan är
 * mjuk-raderad. Upptäckt via en manuell produktionsstädning samma dag —
 * 54+48 föräldralösa occurrences för två barn, skapade under loppet av en
 * enda session (troligen en klient som genererat en occurrence utifrån en
 * tillfälligt inaktuell lokal kopia av en mall som redan tagits bort på ett
 * annat håll, t.ex. via "Ångra senaste import" i en annan flik).
 *
 * Kräver MONGODB_URI=mongodb://... (ej Atlas) — körs automatiskt i CI,
 * hoppas över lokalt om MONGODB_URI saknas eller pekar mot Atlas.
 */

import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/db/connection.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { createTodo } from "../src/services/todosService.js";

const uri = process.env.MONGODB_URI ?? "";
const RUN = uri.startsWith("mongodb://");

describe.skipIf(!RUN)("createTodo: spärrar spök-occurrences", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  const accountId = "account-ghost-test";
  const baseTodo = {
    accountId,
    title: "Borsta tänderna",
    createdBy: "mem-1",
    assignedTo: "mem-1",
    isShared: false,
    status: "pending" as const,
    starValue: 0,
    visual: { type: "lucide-icon" as const, value: "Star" },
    occurrenceDate: "2026-08-05",
    visibleFrom: null,
    expiresAt: null,
    completedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    deletedAt: null,
    deletedBy: null
  };

  it("nekar en occurrence vars recurringSourceId inte pekar på någon existerande mall", async () => {
    await expect(
      createTodo({
        ...baseTodo,
        id: "todo-ghost-occurrence",
        recurrence: { type: "none" },
        recurringSourceId: "todo-does-not-exist"
      })
    ).rejects.toThrow("Mallen för denna återkommande uppgift finns inte längre");

    const saved = await TodoModel.findOne({ id: "todo-ghost-occurrence" });
    expect(saved).toBeNull();
  });

  it("nekar en occurrence vars mall finns men redan är mjuk-raderad", async () => {
    await TodoModel.create({
      ...baseTodo,
      id: "todo-deleted-template",
      recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
      recurringSourceId: null,
      occurrenceDate: null,
      deletedAt: new Date().toISOString(),
      deletedBy: "mem-1"
    });

    await expect(
      createTodo({
        ...baseTodo,
        id: "todo-occurrence-of-deleted-template",
        recurrence: { type: "none" },
        recurringSourceId: "todo-deleted-template"
      })
    ).rejects.toThrow("Mallen för denna återkommande uppgift finns inte längre");
  });

  it("tillåter en occurrence vars mall existerar och är aktiv", async () => {
    await TodoModel.create({
      ...baseTodo,
      id: "todo-active-template",
      recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
      recurringSourceId: null,
      occurrenceDate: null
    });

    const result = await createTodo({
      ...baseTodo,
      id: "todo-valid-occurrence",
      recurrence: { type: "none" },
      recurringSourceId: "todo-active-template"
    });
    expect(result.id).toBe("todo-valid-occurrence");

    const saved = await TodoModel.findOne({ id: "todo-valid-occurrence" }, { _id: 0, deletedAt: 1 }).lean();
    expect(saved).not.toBeNull();
  });

  it("rör inte skapande av mallar eller engångsuppgifter (recurringSourceId===null)", async () => {
    const result = await createTodo({
      ...baseTodo,
      id: "todo-one-off",
      recurrence: { type: "none" },
      recurringSourceId: null
    });
    expect(result.id).toBe("todo-one-off");
  });
});
