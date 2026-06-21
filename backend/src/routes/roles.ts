import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const rolesRouter = Router();

rolesRouter.use(requireAuth);

rolesRouter.get("/", (_request, response) => {
  response.json({ message: "Hämta alla roller — ej implementerat" });
});

rolesRouter.post("/", (_request, response) => {
  response.status(201).json({ message: "Skapa roll — ej implementerat" });
});

rolesRouter.patch("/:id/permissions", (_request, response) => {
  response.json({ message: "Uppdatera behörigheter — ej implementerat" });
});
