import { describe, it, expect } from "vitest";
import { stackDisplayGroups } from "../src/features/children/bankDenoms";

describe("stackDisplayGroups", () => {
  it("räknar inga hela tior för antal under 10", () => {
    expect(stackDisplayGroups(0)).toEqual({ tens: 0, remainder: 0 });
    expect(stackDisplayGroups(4)).toEqual({ tens: 0, remainder: 4 });
    expect(stackDisplayGroups(9)).toEqual({ tens: 0, remainder: 9 });
  });

  it("bryter ut hela tior och lämnar resten 0-9", () => {
    expect(stackDisplayGroups(10)).toEqual({ tens: 1, remainder: 0 });
    expect(stackDisplayGroups(13)).toEqual({ tens: 1, remainder: 3 });
    expect(stackDisplayGroups(23)).toEqual({ tens: 2, remainder: 3 });
    expect(stackDisplayGroups(47)).toEqual({ tens: 4, remainder: 7 });
  });
});
