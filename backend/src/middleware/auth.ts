import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";
import { verifyAccess } from "../utils/tokens.js";

const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");

// Skyddar interna endpoints som anropas av en extern schemalagd pingtjänst (UptimeRobot —
// samma verktyg som redan håller /health vaken, ingen ny betald infrastruktur som Render
// Cron Job behövs), inte av en inloggad användare — därför ingen JWT, bara en delad
// hemlighet. UptimeRobots gratisnivå har begränsat stöd för anpassade headers beroende på
// monitortyp, så hemligheten accepteras både som header och query-parameter.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requireCronSecret(request: Request, response: Response, next: NextFunction) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new Error("CRON_SECRET saknas — sätt den i miljövariablerna innan servern startar (se .env.example)");
  }

  const provided = request.headers["x-cron-secret"] ?? request.query.secret;
  if (typeof provided !== "string" || !safeEqual(provided, expected)) {
    logger.warn({ path: request.path }, "Ogiltig eller saknad cron-hemlighet");
    response.status(401).json({ error: "Inte autentiserad" });
    return;
  }

  next();
}

// CSRF-skydd för endpoints som enbart förlitar sig på cookie (utan Authorization-header).
// Browsers skickar alltid Origin på cross-site POST — blockera allt utom känd frontend-URL.
// Direkta requests (curl, server-till-server) saknar Origin och tillåts.
export function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin && origin !== FRONTEND_URL) {
    logger.warn({ origin, path: req.path }, "CSRF-försök blockerat");
    res.status(403).json({ error: "Cross-site-förfrågan nekad" });
    return;
  }
  next();
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    response.status(401).json({ error: "Inte autentiserad" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccess(token);
    request.userId = payload.userId;

    const memberId = request.headers["x-member-id"];
    if (typeof memberId === "string") {
      request.memberId = memberId;
    }

    next();
  } catch {
    response.status(401).json({ error: "Ogiltig session, logga in igen" });
  }
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      memberId?: string;
    }
  }
}
