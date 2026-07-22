import { describe, expect, it } from "vitest";
import { spreadMarkerLeft } from "../src/features/children/timelineMath";

// Zaida (2026-07-23): "stjärnorna och strecken i tidslinjen går nu ibland
// ihop. Se till att det är en bättre spridning så att strecken hamnar så
// långt ifrån varandra vågrät som möjligt" — ersatte den tidigare
// per-todo-hash-baserade positioneringen (markerLeft), som var oberoende av
// alla ANDRA streck som råkade visas samtidigt och därför kunde ge nästan
// identiska positioner rent slumpmässigt.
describe("spreadMarkerLeft", () => {
  it("returnerar en tom karta för en tom lista", () => {
    expect(spreadMarkerLeft([])).toEqual(new Map());
  });

  it("centrerar en ensam markör", () => {
    const result = spreadMarkerLeft(["todo-1"]);
    expect(result.get("todo-1")).toBe("41%");
  });

  it("sprider två markörer till motsatta ändar av intervallet", () => {
    const result = spreadMarkerLeft(["todo-1", "todo-2"]);
    expect(result.get("todo-1")).toBe("4%");
    expect(result.get("todo-2")).toBe("78%");
  });

  it("sprider flera markörer jämnt, ingen kollision, maximalt avstånd mellan grannar", () => {
    const ids = ["todo-1", "todo-2", "todo-3", "todo-4", "todo-5"];
    const result = spreadMarkerLeft(ids);
    const positions = ids.map((id) => Number(result.get(id)!.replace("%", "")));

    expect(new Set(positions).size).toBe(ids.length);
    expect(positions[0]).toBe(4);
    expect(positions[positions.length - 1]).toBe(78);

    const gaps = positions.slice(1).map((p, i) => p - positions[i]);
    const expectedGap = 74 / (ids.length - 1);
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(expectedGap, 5);
    }
  });

  it("ger samma position oavsett vilket todo-id som råkar stå var i listan (rent index-baserat)", () => {
    const a = spreadMarkerLeft(["x", "y", "z"]);
    const b = spreadMarkerLeft(["a", "b", "c"]);
    expect([...a.values()]).toEqual([...b.values()]);
  });
});
