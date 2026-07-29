import { describe, expect, it } from "vitest";
import { buildTimedTaskTemplateCsv, parseTimedTaskCsv, resolveChildId, timedTasksToCsv } from "../src/features/timedTasks/timedTaskCsv";
import type { Member, TimedTaskWithBest } from "@shared/types";

function child(id: string, name: string): Member {
  return {
    id, accountId: "acc-1", userId: null, name, roleId: "role-child", isChild: true,
    avatarUrl: null, color: null, dashboardTheme: null, spentStars: 0, approvedStars: 0,
    deletedAt: null, deletedBy: null
  };
}

function task(overrides: Partial<TimedTaskWithBest> = {}): TimedTaskWithBest {
  return {
    id: "task-1", accountId: "acc-1", title: "Spring ett varv", symbol: "🏃",
    assignedTo: "mem-child-1", createdBy: "mem-1", deletedAt: null, deletedBy: null,
    bestDurationMs: null, bestAchievedAt: null, attemptCount: 0,
    ...overrides
  };
}

describe("buildTimedTaskTemplateCsv", () => {
  it("innehåller rätt rubriker", () => {
    expect(buildTimedTaskTemplateCsv().split("\n")[0]).toBe("Titel,Emoji,Barn");
  });
});

describe("timedTasksToCsv", () => {
  it("exporterar med barnets namn, hoppar över raderade", () => {
    const children = [child("mem-child-1", "Nova")];
    const tasks = [task(), task({ id: "task-2", deletedAt: "2026-01-01T00:00:00.000Z" })];
    const csv = timedTasksToCsv(tasks, children);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Spring ett varv,🏃,Nova");
  });
});

describe("parseTimedTaskCsv", () => {
  it("tolkar en giltig rad", () => {
    const csv = "Titel,Emoji,Barn\r\nHoppa rep,🤾,Nova\r\n";
    const { rows, errors } = parseTimedTaskCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ title: "Hoppa rep", symbol: "🤾", childName: "Nova" }]);
  });

  it("hoppar över en rad utan barn angivet", () => {
    const csv = "Titel,Emoji,Barn\r\nHoppa rep,🤾,\r\n";
    const { rows, errors } = parseTimedTaskCsv(csv);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("en cell med vanlig text istället för en emoji faller tillbaka på null", () => {
    const csv = "Titel,Emoji,Barn\r\nHoppa rep,löpning,Nova\r\n";
    const [row] = parseTimedTaskCsv(csv).rows;
    expect(row.symbol).toBeNull();
  });
});

describe("resolveChildId", () => {
  it("matchar skiftlägesokänsligt, returnerar null för okänt namn", () => {
    const children = [child("mem-child-1", "Nova")];
    expect(resolveChildId("nova", children)).toBe("mem-child-1");
    expect(resolveChildId("Okänd", children)).toBeNull();
  });
});
