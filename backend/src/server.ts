import "dotenv/config";
import express from "express";
import { connectDB } from "./db/connection.js";
import { accountsRouter } from "./routes/accounts.js";
import { calendarsRouter } from "./routes/calendars.js";
import { membersRouter } from "./routes/members.js";
import { rewardsRouter } from "./routes/rewards.js";
import { rolesRouter } from "./routes/roles.js";
import { shoppingRouter } from "./routes/shopping.js";
import { todosRouter } from "./routes/todos.js";

const PORT = process.env.PORT ?? 3000;
const app = express();

app.use(express.json());

app.use("/api/accounts", accountsRouter);
app.use("/api/members", membersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/todos", todosRouter);
app.use("/api/calendars", calendarsRouter);
app.use("/api/shopping", shoppingRouter);
app.use("/api/rewards", rewardsRouter);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Servern lyssnar på port ${PORT}`);
  });
}

start().catch(console.error);
