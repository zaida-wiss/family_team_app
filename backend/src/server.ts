import "dotenv/config";
import "express-async-errors";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import { connectDB } from "./db/connection.js";
import { authRouter } from "./routes/auth.js";
import { accountsRouter } from "./routes/accounts.js";
import { calendarsRouter, syncSubscription } from "./routes/calendars.js";
import { CalendarModel } from "./db/models/Calendar.js";
import { invitationsRouter } from "./routes/invitations.js";
import { membersRouter } from "./routes/members.js";
import { rewardsRouter } from "./routes/rewards.js";
import { rolesRouter } from "./routes/roles.js";
import { shoppingRouter } from "./routes/shopping.js";
import { todosRouter } from "./routes/todos.js";

const PORT = process.env.PORT ?? 3000;
const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");

const app = express();

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
  console.error(err);
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Okänt fel";
  response.status(status).json({ error: message });
};

app.use(errorHandler);

async function syncAllSubscriptions() {
  const calendars = await CalendarModel.find({ deletedAt: null });
  for (const cal of calendars) {
    for (const sub of cal.subscriptions ?? []) {
      await syncSubscription(cal.id, sub as any).catch(console.error);
    }
  }
}

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Servern lyssnar på port ${PORT}`);
  });
  // Sync all subscriptions every hour
  setInterval(() => { syncAllSubscriptions().catch(console.error); }, 60 * 60 * 1000);
}

start().catch(console.error);
