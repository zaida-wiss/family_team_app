import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const calendarsRouter = Router();

calendarsRouter.use(requireAuth);

calendarsRouter.get("/", (_request, response) => {
  response.json({ message: "Hämta tillgängliga kalendrar — ej implementerat" });
});

calendarsRouter.post("/", (_request, response) => {
  response.status(201).json({ message: "Skapa kalender — ej implementerat" });
});

calendarsRouter.post("/:id/events", (_request, response) => {
  response.status(201).json({ message: "Lägg till kalenderhändelse — ej implementerat" });
});

calendarsRouter.post("/:id/share", (_request, response) => {
  response.json({ message: "Dela kalender — ej implementerat" });
});

calendarsRouter.delete("/:id/share/:memberId", (_request, response) => {
  response.json({ message: "Ta bort kalenderdelning — ej implementerat" });
});

calendarsRouter.post("/:id/import", (_request, response) => {
  response.json({ message: "Importera ICS-fil — ej implementerat" });
});

calendarsRouter.delete("/:id", (_request, response) => {
  response.json({ message: "Flytta kalender till papperskorg — ej implementerat" });
});

calendarsRouter.patch("/:id/restore", (_request, response) => {
  response.json({ message: "Återställ kalender — ej implementerat" });
});
