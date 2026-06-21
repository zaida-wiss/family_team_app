import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";

export type AccessPayload = { userId: string };

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    response.status(401).json({ error: "Inte autentiserad" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as AccessPayload;
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
