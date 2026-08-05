import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setAccessToken,
  setApiMemberId,
  setRefreshSessionHandler,
  setUnauthorizedHandler,
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
    setUnauthorizedHandler(() => {});
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("två SSE-kanaler som båda får 401 samtidigt delar samma refresh-anrop, inte varsitt", async () => {
    let refreshCallCount = 0;
    // Hålls olöst under själva testet (testar bara att handlern anropas EN
    // gång, inte hela den efterföljande återanslutningen) — men MÅSTE
    // faktiskt lösas innan testet avslutas: client.ts:s modulnivå-cachade
    // refreshPromise nollställs bara i en .finally() på detta löfte, en
    // permanent olöst promise här skulle annars smitta NÄSTA test (som då
    // felaktigt återanvänder detta testets redan-i-gång-varande refresh
    // istället för att anropa handlern på nytt).
    let resolveRefresh: (() => void) | undefined;
    setRefreshSessionHandler(() => {
      refreshCallCount++;
      return new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      });
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

    unsubscribe1();
    unsubscribe2();
    // Löser refresh-löftet EFTER städningen — nollställer client.ts:s
    // interna refreshPromise-cache så nästa test i filen inte ärver detta
    // testets olösta refresh av misstag.
    resolveRefresh?.();
    await Promise.resolve();
  });

  // 2026-08-05, Zaidas fynd: /api/todos/events fortsatte visa 401 om och om
  // igen, aldrig återhämtad — appen "hängde" tyst istället för att logga ut
  // och visa inloggningsformuläret igen. Grundorsak: till skillnad från den
  // vanliga request()-vägens retryAfterRefresh (som redan ropar
  // onUnauthorized() om refreshSessionOnce() kastar) saknade SSE-vägen helt
  // motsvarande fallback — en GENUINT misslyckad refresh (inte bara ett race
  // mot en annan samtidig kanal) fick reconnect-loopen att bara fortsätta
  // försöka om och om igen i evighet utan att någonsin trigga utloggningen.
  test("en genuint misslyckad refresh (inte bara ett race) triggar onUnauthorized, loggar ut istället för att hänga i evig retry", async () => {
    // Denna testfil körs i vitest:s "node"-miljö (ingen jsdom, se
    // vite.config.ts) — `window` finns alltså inte som global överhuvudtaget.
    // connect()-loopen schemalägger alltid en paus (client.ts:s delay(),
    // window.setTimeout) efter VARJE försök, lyckat eller inte — utan en
    // `window`-stub kraschar det anropet med "window is not defined" så
    // fort loopen når dit (vilket den gör direkt efter att onUnauthorized
    // kallats, i samma synkrona fortsättning). Stubbar en minimal `window`
    // vars setTimeout aldrig löser sin callback, så loopen bara gör EN enda
    // återanslutning (den vi testar) och sedan hänger ofarligt kvar.
    vi.stubGlobal("window", { setTimeout: vi.fn(() => 0) });

    setRefreshSessionHandler(() => Promise.reject(new Error("Ogiltig refresh-cookie")));
    const unauthorizedHandler = vi.fn();
    setUnauthorizedHandler(unauthorizedHandler);

    const fetchMock = vi.fn(() => Promise.resolve(emptyStreamResponse(401)));
    vi.stubGlobal("fetch", fetchMock);

    const unsubscribe = subscribeToServerEvents("/api/todos/events", () => {});

    await vi.waitFor(() => expect(unauthorizedHandler).toHaveBeenCalledTimes(1));

    unsubscribe();
  });
});
