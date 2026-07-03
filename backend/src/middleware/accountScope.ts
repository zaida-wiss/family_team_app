import type { NextFunction, Request, Response } from "express";
import { accountIdOf } from "../utils/memberUtils.js";

// Ersätter `const accountId = await accountIdOf(req.memberId, req.userId)` som
// upprepades i varje route-handler (60+ ställen över 8 routerfiler, Sprint 3 S5).
// Måste köras efter requireAuth (behöver req.userId/req.memberId).
export async function attachAccountId(request: Request, _response: Response, next: NextFunction) {
  request.accountId = await accountIdOf(request.memberId, request.userId);
  next();
}

declare global {
  namespace Express {
    interface Request {
      accountId?: string;
    }
  }
}
