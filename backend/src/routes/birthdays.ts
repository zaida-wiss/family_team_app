import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as birthdays from "../services/birthdaysService.js";
import * as familyConnections from "../services/familyConnectionsService.js";

export const birthdaysRouter = Router();
birthdaysRouter.use(requireAuth, attachAccountId);

// Familjeanslutningar (ADR-0030) — måste registreras FÖRE PATCH/DELETE-
// rutterna med /:id nedan, annars matchar Express "connections" literalt
// som ett birthday-id (samma skäl som todos.ts/shopping.ts).
birthdaysRouter.get("/connections", async (req, res) => {
  res.json(await familyConnections.getConnectionBirthdays(req.accountId!, req.memberId ?? null));
});

birthdaysRouter.get("/", async (req, res) => {
  res.json(await birthdays.getAllBirthdays(req.accountId!, req.memberId ?? null));
});

birthdaysRouter.post("/", async (req, res) => {
  res.status(201).json(await birthdays.createBirthday(req.accountId!, req.memberId ?? null, req.body));
});

birthdaysRouter.patch("/:id", async (req, res) => {
  res.json(await birthdays.updateBirthday(req.params.id, req.accountId!, req.memberId ?? null, req.body));
});

birthdaysRouter.delete("/:id", async (req, res) => {
  res.json(await birthdays.deleteBirthday(req.params.id, req.accountId!, req.memberId ?? null));
});
