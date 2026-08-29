import { describe, test, expect } from "vitest";
import { getTaskStyle } from "../src/features/children/ChildTasksSection";

// 2026-08-28 — backloggfynd 2026-08-13: en tom kategoristräng (todos utan
// personalCategoryId, t.ex. Familjen-poolen eller barn-tilldelade uppgifter)
// föll igenom till hash-grenen, där [...""].reduce(...) alltid gav 0 och
// därmed alltid "hälsa"-färgen — trots att kortet inte har någon kategori.
// Utökad 2026-08-29 med --task-fg (Zaida: "vissa av todo korten fått låg
// kontrast") — --card (den tomma kategorins bakgrund) är läge-/temaberoende
// (mörk i mörkt läge), till skillnad från --cat-*-bg som ALLTID är blandade
// mot vitt — hårdkodad svart text (.child-task-name) blev osynlig mot en
// mörk --card. Bytt till --c4/--on-c4, samma redan säkra "dashboard-theme-
// token-bridge"-par som delmoment-kortens kontrastfix (2026-08-16).
describe("getTaskStyle", () => {
  test("en tom kategori ger neutrala, kategorioberoende, mörkt-läge-säkra tokens (inte hälsa-färgen)", () => {
    expect(getTaskStyle("")).toEqual({
      "--task-accent": "var(--muted-fg)", "--task-bg": "var(--c4)", "--task-fg": "var(--on-c4)"
    });
  });

  test("en kategori som bara är whitespace räknas också som tom", () => {
    expect(getTaskStyle("   ")).toEqual({
      "--task-accent": "var(--muted-fg)", "--task-bg": "var(--c4)", "--task-fg": "var(--on-c4)"
    });
  });

  test("en känd kategori ger fortfarande sin egna accentfärg och alltid svart text (--cat-*-bg är alltid ljus)", () => {
    expect(getTaskStyle("Hälsa")).toEqual({
      "--task-accent": "var(--cat-hälsa-accent)", "--task-bg": "var(--cat-hälsa-bg)", "--task-fg": "var(--black, #000)"
    });
    expect(getTaskStyle("Pengar")).toEqual({
      "--task-accent": "var(--cat-pengar-accent)", "--task-bg": "var(--cat-pengar-bg)", "--task-fg": "var(--black, #000)"
    });
  });

  test("en okänd, icke-tom kategori hashas fortfarande deterministiskt till en av de fyra", () => {
    const style = getTaskStyle("Skola");
    expect(style["--task-accent"]).toMatch(/^var\(--cat-(hälsa|trivsel|skills|pengar)-accent\)$/);
  });
});
