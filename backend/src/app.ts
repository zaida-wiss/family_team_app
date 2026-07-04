import "dotenv/config";
import "express-async-errors";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { ErrorRequestHandler, Request, Response } from "express";
import { logger } from "./utils/logger.js";
import { authRouter } from "./routes/auth.js";
import { accountsRouter } from "./routes/accounts.js";
import { calendarsRouter } from "./routes/calendars.js";
import { invitationsRouter } from "./routes/invitations.js";
import { membersRouter } from "./routes/members.js";
import { rewardsRouter } from "./routes/rewards.js";
import { rewardShopRouter } from "./routes/rewardShop.js";
import { rolesRouter } from "./routes/roles.js";
import { shoppingRouter } from "./routes/shopping.js";
import { todosRouter } from "./routes/todos.js";
import { analyticsRouter } from "./routes/analytics.js";
import { adminRouter } from "./routes/admin.js";
import { timedTasksRouter } from "./routes/timedTasks.js";

const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");


const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: "För många förfrågningar, försök igen senare" });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, "Auth rate limit exceeded");
    res.status(429).json({ error: "För många inloggningsförsök, försök igen om 15 minuter" });
  }
});

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.get("/health", (_req, res) => { res.json({ ok: true }); });

app.use("/api/auth", authRouter);
app.use("/api", invitationsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/members", membersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/todos", todosRouter);
app.use("/api/calendars", calendarsRouter);
app.use("/api/shopping", shoppingRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/reward-shop", rewardShopRouter);
app.use("/api/timed-tasks", timedTasksRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/admin", adminRouter);

const errorHandler: ErrorRequestHandler = (err, _request, response, _next) => {
  logger.error(err);
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Okänt fel";
  response.status(status).json({ error: message });
};

app.use(errorHandler);
