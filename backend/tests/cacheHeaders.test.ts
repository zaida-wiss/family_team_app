/**
 * Regressionstest för fyndet 2026-07-04: /api-svar saknade ett eget
 * Cache-Control-huvud, vilket lät Vercels/Cloudflares standard-cachepolicy
 * (public, med en Express-genererad ETag) ta över — ett delat mellanlager
 * kunde då lagra och återanvända ett autentiserat, per-konto-svar. Symptomet
 * var att ett nyss godkänt uppdrag kunde visas som "väntar" igen efter en
 * sidomladdning, trots att databasen redan hade det korrekta, godkända
 * tillståndet.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Cache-Control", () => {
  it("/health har no-store och ingen ETag", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["etag"]).toBeUndefined();
  });
});
