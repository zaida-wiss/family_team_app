import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { compressionFilter } from "../src/utils/compressionFilter.js";

// 2026-07-27, se app.ts filhuvud: `compressible` räknar text/event-stream som
// komprimerbart, vilket i praktiken fastnade våra tre SSE-strömmars
// realtidshändelser i komprimeringsbufferten (bara en fullständigt avslutad
// request, som en vanlig JSON-hämtning, flushar garanterat).
function fakeRes(contentType: string): Response {
  return { getHeader: () => contentType } as unknown as Response;
}

const fakeReq = { headers: {} } as unknown as Request;

describe("compressionFilter", () => {
  it("komprimerar INTE ett text/event-stream-svar (SSE)", () => {
    expect(compressionFilter(fakeReq, fakeRes("text/event-stream"))).toBe(false);
  });

  it("komprimerar ett vanligt JSON-svar (delegerar till compression.filter)", () => {
    expect(compressionFilter(fakeReq, fakeRes("application/json; charset=utf-8"))).toBe(true);
  });
});
