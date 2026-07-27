import compression from "compression";
import type { Request, Response } from "express";

// Utesluter SSE-strömmar från gzip/br-komprimeringen (2026-07-27, se app.ts
// filhuvud för fullständigt resonemang) — `compressible` räknar
// text/event-stream som komprimerbart, men en långlivad ström flushar aldrig
// nedströms förrän komprimeringsbufferten fyllts eller anslutningen stängs,
// vilket i praktiken höll realtidshändelser (members/todos/reward-shop)
// fast obestämt istället för att nå klienten direkt.
export function compressionFilter(req: Request, res: Response): boolean {
  if (res.getHeader("Content-Type")?.toString().includes("text/event-stream")) {
    return false;
  }
  return compression.filter(req, res);
}
