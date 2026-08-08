import { describe, expect, it } from "vitest";
import { splitPastedShoppingItems } from "../src/features/shopping/parseShoppingPaste";

// Klistra in flera varor på en gång i inköpslistan (2026-08-09, Zaidas
// önskemål: "bara de har ett radbryt, eller semikolon").
describe("splitPastedShoppingItems", () => {
  it("delar på radbrytningar", () => {
    expect(splitPastedShoppingItems("Mjölk\nBröd\nSmör")).toEqual(["Mjölk", "Bröd", "Smör"]);
  });

  it("delar på semikolon", () => {
    expect(splitPastedShoppingItems("Mjölk; Bröd; Smör")).toEqual(["Mjölk", "Bröd", "Smör"]);
  });

  it("hanterar CRLF-radbrytningar", () => {
    expect(splitPastedShoppingItems("Mjölk\r\nBröd\r\nSmör")).toEqual(["Mjölk", "Bröd", "Smör"]);
  });

  it("blandar radbrytningar och semikolon", () => {
    expect(splitPastedShoppingItems("Mjölk\nBröd; Smör")).toEqual(["Mjölk", "Bröd", "Smör"]);
  });

  it("trimmar whitespace runt varje vara", () => {
    expect(splitPastedShoppingItems("  Mjölk  \n  Bröd  ")).toEqual(["Mjölk", "Bröd"]);
  });

  it("tar bort tomma rader (dubbla radbrytningar, trailing semikolon)", () => {
    expect(splitPastedShoppingItems("Mjölk\n\nBröd;;")).toEqual(["Mjölk", "Bröd"]);
  });

  it("ger en enda vara vid en vanlig, enkel inklistring utan separator", () => {
    expect(splitPastedShoppingItems("Mjölk")).toEqual(["Mjölk"]);
  });

  it("ger tom lista för tom/whitespace-text", () => {
    expect(splitPastedShoppingItems("   ")).toEqual([]);
    expect(splitPastedShoppingItems("")).toEqual([]);
  });
});
