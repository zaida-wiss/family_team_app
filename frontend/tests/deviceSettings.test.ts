// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDeviceSetting, getDeviceSetting, setDeviceSetting } from "../src/utils/deviceSettings";

// Enhetsspecifika inställningar (2026-08-10) — textstorlek/bubbelstorlek/
// trådavstånd sparas bara i localStorage på DEN HÄR enheten, aldrig synkat
// till kontot. useDeviceSetting.ts (den React-hook som lindar in dessa
// funktioner) testas inte separat — jsdom-miljön saknar en etablerad
// renderHook-konvention i den här kodbasen, och all den intressanta logiken
// (parsing/felhantering) ligger redan här.
describe("deviceSettings", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("returnerar null när inget är sparat", () => {
    expect(getDeviceSetting("textSize")).toBeNull();
  });

  it("rundtrippar ett värde via set/get", () => {
    setDeviceSetting("textSize", "large");
    expect(getDeviceSetting("textSize")).toBe("large");
  });

  it("rundtrippar ett numeriskt värde", () => {
    setDeviceSetting("todoBubbleSize", 120);
    expect(getDeviceSetting("todoBubbleSize")).toBe(120);
  });

  it("clearDeviceSetting tar bort en tidigare sparad override", () => {
    setDeviceSetting("todoThreadGap", 16);
    clearDeviceSetting("todoThreadGap");
    expect(getDeviceSetting("todoThreadGap")).toBeNull();
  });

  it("olika nycklar krockar inte med varandra", () => {
    setDeviceSetting("textSize", "extra-large");
    setDeviceSetting("todoBubbleSize", 140);
    expect(getDeviceSetting("textSize")).toBe("extra-large");
    expect(getDeviceSetting("todoBubbleSize")).toBe(140);
  });

  it("ger null istället för att kasta om localStorage.getItem misslyckas (t.ex. privat läge)", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getDeviceSetting("textSize")).toBeNull();
    spy.mockRestore();
  });

  it("sväljer ett misslyckat setItem (t.ex. full lagring) utan att kasta", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => setDeviceSetting("textSize", "normal")).not.toThrow();
    spy.mockRestore();
  });

  it("ger null för sparad, men trasig (icke-JSON) data istället för att kasta", () => {
    localStorage.setItem("device-setting:textSize", "{inte giltig json");
    expect(getDeviceSetting("textSize")).toBeNull();
  });
});
