import { describe, test, expect } from "vitest";
import { extractLeadingEmoji } from "../src/utils/extractLeadingEmoji";

// 2026-08-12 — delmoment saknar ett eget emoji-fält, familjen skriver redan
// emojin rakt in i titeln (se TodoDetailView.tsx:s checklista). Denna
// plockar ut den ledande emojin så den kan återanvändas som kortikon på
// dashboarden (ChildTasksSection.tsx/getAssignedSubtaskCards).
describe("extractLeadingEmoji", () => {
  test("en enkel ledande emoji plockas ut, resten av texten trimmas", () => {
    expect(extractLeadingEmoji("🧺Plocka in i diskmaskinen")).toEqual({
      emoji: "🧺",
      rest: "Plocka in i diskmaskinen"
    });
  });

  test("en emoji med variant-väljare (t.ex. ▶️/🗑️) plockas ut i sin helhet", () => {
    expect(extractLeadingEmoji("▶️Starta diskmaskinen")).toEqual({ emoji: "▶️", rest: "Starta diskmaskinen" });
    expect(extractLeadingEmoji("🗑️Töm matavfall")).toEqual({ emoji: "🗑️", rest: "Töm matavfall" });
  });

  test("mellanslag mellan emoji och text hanteras likadant", () => {
    expect(extractLeadingEmoji("💡 Säck lampor")).toEqual({ emoji: "💡", rest: "Säck lampor" });
  });

  test("ingen ledande emoji ger null och den (trimmade) texten oförändrad", () => {
    expect(extractLeadingEmoji("Dammsuga")).toEqual({ emoji: null, rest: "Dammsuga" });
  });

  test("en emoji mitt i eller sist i texten räknas inte som LEDANDE", () => {
    expect(extractLeadingEmoji("Handla mjölk 🥛")).toEqual({ emoji: null, rest: "Handla mjölk 🥛" });
  });

  test("en ZWJ-sammansatt emoji (t.ex. en familjeemoji) plockas ut i sin helhet", () => {
    expect(extractLeadingEmoji("👨‍👩‍👧 Familjemöte")).toEqual({ emoji: "👨‍👩‍👧", rest: "Familjemöte" });
  });
});
