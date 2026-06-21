import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const accountsRouter = Router();

accountsRouter.use(requireAuth);

accountsRouter.get("/:id", (_request, response) => {
  response.json({ message: "Hämta konto — ej implementerat" });
});

accountsRouter.put("/:id", (_request, response) => {
  response.json({ message: "Uppdatera konto — ej implementerat" });
});
