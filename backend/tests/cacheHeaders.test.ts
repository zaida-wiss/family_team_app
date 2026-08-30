/**
 * Regressionstest för fyndet 2026-07-04: /api-svar saknade ett eget
 * Cache-Control-huvud, vilket lät Vercels/Cloudflares standard-cachepolicy
 * (public, med en Express-genererad ETag) ta över — ett delat mellanlager
 * kunde då lagra och återanvända ett autentiserat, per-konto-svar. Symptomet
 * var att ett nyss godkänt uppdrag kunde visas som "väntar" igen efter en
 * sidomladdning, trots att databasen redan hade det korrekta, godkända
 * tillståndet.
 *
 * 2026-08-30 (bandbreddsutredning): `no-store` bytt till `private, no-cache`
 * + ETag påslaget — se app.ts:s kommentar för hela resonemanget. `private`
 * håller samma löfte som `no-store` gjorde (aldrig cachebart av ett delat
 * mellanlager), `no-cache` tvingar dessutom fram en riktig friskhetskontroll
 * mot servern varje gång (aldrig tyst återanvänd data) — men ETag-matchning
 * ger ett tomt 304 istället för att skicka hela svarskroppen igen.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Cache-Control", () => {
  it("/health har private+no-cache och en ETag", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["cache-control"]).toBe("private, no-cache");
    expect(res.headers["etag"]).toBeDefined();
  });

  it("ett upprepat GET med matchande If-None-Match ger 304 utan svarskropp, inte hela JSON:en igen", async () => {
    const first = await request(app).get("/health");
    const etag = first.headers["etag"];
    expect(etag).toBeDefined();

    const second = await request(app).get("/health").set("If-None-Match", etag);
    expect(second.status).toBe(304);
    expect(second.text).toBe("");
  });

  it("ett GET med en INAKTUELL If-None-Match ger fortfarande 200 med full svarskropp", async () => {
    const res = await request(app).get("/health").set("If-None-Match", '"nagot-annat-inaktuellt-varde"');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
