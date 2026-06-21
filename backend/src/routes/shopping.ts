import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const shoppingRouter = Router();

shoppingRouter.use(requireAuth);

shoppingRouter.get("/", (_request, response) => {
  response.json({ message: "Hämta tillgängliga inköpslistor — ej implementerat" });
});

shoppingRouter.post("/", (_request, response) => {
  response.status(201).json({ message: "Skapa inköpslista — ej implementerat" });
});

shoppingRouter.post("/:id/items", (_request, response) => {
  response.status(201).json({ message: "Lägg till vara — ej implementerat" });
});

shoppingRouter.patch("/:id/items/:itemId/toggle", (_request, response) => {
  response.json({ message: "Bocka av/av vara — ej implementerat" });
});

shoppingRouter.post("/:id/share", (_request, response) => {
  response.json({ message: "Dela inköpslista — ej implementerat" });
});

shoppingRouter.delete("/:id/share/:memberId", (_request, response) => {
  response.json({ message: "Ta bort listdelning — ej implementerat" });
});

shoppingRouter.delete("/:id", (_request, response) => {
  response.json({ message: "Flytta lista till papperskorg — ej implementerat" });
});

shoppingRouter.patch("/:id/restore", (_request, response) => {
  response.json({ message: "Återställ lista — ej implementerat" });
});
