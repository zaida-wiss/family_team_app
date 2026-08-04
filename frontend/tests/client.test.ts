import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setAccessToken,
  setApiMemberId,
  setRefreshSessionHandler,
  subscribeToServerEvents
} from "../src/api/client";

// 2026-08-04, Zaidas fynd: konsolen visade en oåterhämtad 401 på
// /api/reward-shop/events. Appen har TRE oberoende SSE-kanaler (todos/
// members/reward-shop) som alla återansluter mot samma access-token — går
// token ut (15 min) medan fliken är öppen kan alla tre få 401 nästan
// samtidigt. fetchEventStream anropade tidigare refreshSession() DIREKT
// (odeduplicerat) vid en 401, till skillnad från den vanliga request()-
// vägens redan deduplicerade refreshSessionOnce() — roterande refresh-
// tokens ogiltigförklarar sig själva efter första användningen, så en andra
// samtidig refresh-förfrågan kunde nekas. Detta test verifierar att BÅDA
// kanalerna nu delar samma in-flight refresh-anrop istället för att trigga
// varsitt.

function emptyStreamResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body:
      status === 200
        ? { getReader: () => ({ read: () => Promise.resolve({ done: true, value: undefined }) }) }
        : null
  } as unknown as Response;
}

describe("client.ts SSE-återanslutning", () => {
  beforeEach(() => {
    setAccessToken("old-token");
    setApiMemberId("mem-1");
  });

  afterEach(() => {
    setAccessToken(null);
    setApiMemberId(null);
    vi.restoreAllMocks();
  });

  test("två SSE-kanaler som båda får 401 samtidigt delar samma refresh-anrop, inte varsitt", async () => {
    let refreshCallCount = 0;
    // Löses aldrig — testet behöver bara verifiera att handlern anropas EN
    // gång, inte hela den efterföljande återanslutningen.
    setRefreshSessionHandler(() => {
      refreshCallCount++;
      return new Promise<void>(() => {});
    });

    const fetchMock = vi.fn(() => Promise.resolve(emptyStreamResponse(401)));
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe1 = subscribeToServerEvents("/api/todos/events", () => {});
    const unsubscribe2 = subscribeToServerEvents("/api/reward-shop/events", () => {});

    // Låt båda kanalernas första (401-svarande) fetch hinna avslutas och
    // trigga sitt refresh-anrop.
    await vi.waitFor(() => expect(refreshCallCount).toBeGreaterThan(0));
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshCallCount).toBe(1);

    // Städa upp direkt — den ännu olösta refresh-mocken (medvetet aldrig
    // resolve:ad) lämnar attemptConnection() hängande i väntan, men det
    // testar inte mer än vad detta test avser (bara deduplikeringen).
    unsubscribe1();
    unsubscribe2();
  });
});
