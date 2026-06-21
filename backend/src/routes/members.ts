import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const membersRouter = Router();

membersRouter.use(requireAuth);

membersRouter.get("/", (_request, response) => {
  response.json({ message: "Hämta alla medlemmar — ej implementerat" });
});

membersRouter.post("/", (_request, response) => {
  response.status(201).json({ message: "Skapa medlem — ej implementerat" });
});

membersRouter.delete("/:id", (_request, response) => {
  response.json({ message: "Ta bort medlem — ej implementerat" });
});
