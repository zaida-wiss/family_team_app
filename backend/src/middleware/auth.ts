import type { NextFunction, Request, Response } from "express";

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const memberId = request.headers["x-member-id"];

  if (!memberId || typeof memberId !== "string") {
    response.status(401).json({ error: "Inte autentiserad" });
    return;
  }

  request.memberId = memberId;
  next();
}

declare global {
  namespace Express {
    interface Request {
      memberId?: string;
    }
  }
}
