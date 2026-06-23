import "dotenv/config";
import "express-async-errors";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { ErrorRequestHandler } from "express";
import { logger } from "./utils/logger.js";
import { authRouter } from "./routes/auth.js";
import { accountsRouter } from "./routes/accounts.js";
import { calendarsRouter } from "./routes/calendars.js";
import { invitationsRouter } from "./routes/invitations.js";
import { membersRouter } from "./routes/members.js";
import { rewardsRouter } from "./routes/rewards.js";
import { rolesRouter } from "./routes/roles.js";
import { shoppingRouter } from "./routes/shopping.js";
import { todosRouter } from "./routes/todos.js";

const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");

export const app = express();

app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRouter);
app.use("/api", invitationsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/members", membersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/todos", todosRouter);
app.use("/api/calendars", calendarsRouter);
app.use("/api/shopping", shoppingRouter);
app.use("/api/rewards", rewardsRouter);

const errorHandler: ErrorRequestHandler = (err, _request, response, _next) => {
  logger.error(err);
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Okänt fel";
  response.status(status).json({ error: message });
};

app.use(errorHandler);
