// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import { readCache, writeCache } from "../src/utils/localCache";

describe("localCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("readCache returns the fallback when nothing is stored", () => {
    expect(readCache("missing_key", [1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("writeCache then readCache round-trips the data", () => {
    writeCache("my_key", { a: 1, b: [2, 3] });
    expect(readCache("my_key", null)).toEqual({ a: 1, b: [2, 3] });
  });

  test("readCache falls back gracefully on corrupt JSON", () => {
    localStorage.setItem("bad_key", "{not valid json");
    expect(readCache("bad_key", "fallback")).toBe("fallback");
  });
});
