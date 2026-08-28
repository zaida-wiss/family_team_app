import { describe, test, expect } from "vitest";
import { getTaskStyle } from "../src/features/children/ChildTasksSection";

// 2026-08-28 — backloggfynd 2026-08-13: en tom kategoristräng (todos utan
// personalCategoryId, t.ex. Familjen-poolen eller barn-tilldelade uppgifter)
// föll igenom till hash-grenen, där [...""].reduce(...) alltid gav 0 och
// därmed alltid "hälsa"-färgen — trots att kortet inte har någon kategori.
describe("getTaskStyle", () => {
  test("en tom kategori ger neutrala, kategorioberoende tokens (inte hälsa-färgen)", () => {
    expect(getTaskStyle("")).toEqual({ "--task-accent": "var(--muted-fg)", "--task-bg": "var(--card)" });
  });

  test("en kategori som bara är whitespace räknas också som tom", () => {
    expect(getTaskStyle("   ")).toEqual({ "--task-accent": "var(--muted-fg)", "--task-bg": "var(--card)" });
  });

  test("en känd kategori ger fortfarande sin egna accentfärg", () => {
    expect(getTaskStyle("Hälsa")).toEqual({ "--task-accent": "var(--cat-hälsa-accent)", "--task-bg": "var(--cat-hälsa-bg)" });
    expect(getTaskStyle("Pengar")).toEqual({ "--task-accent": "var(--cat-pengar-accent)", "--task-bg": "var(--cat-pengar-bg)" });
  });

  test("en okänd, icke-tom kategori hashas fortfarande deterministiskt till en av de fyra", () => {
    const style = getTaskStyle("Skola");
    expect(style["--task-accent"]).toMatch(/^var\(--cat-(hälsa|trivsel|skills|pengar)-accent\)$/);
  });
});
