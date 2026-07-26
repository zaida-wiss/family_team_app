import { describe, expect, it, vi } from "vitest";
import { deferToIdle } from "../src/utils/deferToIdle";

// Prestandaomgången (2026-07-26, S1a) — deferToIdle skjuter upp icke-
// kritiska datahämtningar till efter första målningen. jsdom (testmiljön)
// saknar requestIdleCallback, så testerna verifierar bara setTimeout-
// fallbacket faktiskt körs asynkront, inte requestIdleCallback-grenen
// (den täcks indirekt av att koden typecheckar mot DOM-libet).
describe("deferToIdle", () => {
  it("kör callbacken asynkront (inte synkront direkt vid anrop)", () => {
    let called = false;
    deferToIdle(() => { called = true; });
    expect(called).toBe(false);
  });

  it("kör callbacken efter en tick", async () => {
    const callback = vi.fn();
    deferToIdle(callback);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callback).toHaveBeenCalledOnce();
  });
});
