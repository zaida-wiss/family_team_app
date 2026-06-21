import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const todosRouter = Router();

todosRouter.use(requireAuth);

todosRouter.get("/", (_request, response) => {
  response.json({ message: "Hämta synliga todos — ej implementerat" });
});

todosRouter.post("/", (_request, response) => {
  response.status(201).json({ message: "Skapa todo — ej implementerat" });
});

todosRouter.patch("/:id/complete", (_request, response) => {
  response.json({ message: "Markera todo som klar — ej implementerat" });
});

todosRouter.patch("/:id/approve", (_request, response) => {
  response.json({ message: "Godkänn todo — ej implementerat" });
});

todosRouter.patch("/:id/reject", (_request, response) => {
  response.json({ message: "Neka todo — ej implementerat" });
});

todosRouter.delete("/:id", (_request, response) => {
  response.json({ message: "Flytta todo till papperskorg — ej implementerat" });
});

todosRouter.patch("/:id/restore", (_request, response) => {
  response.json({ message: "Återställ todo — ej implementerat" });
});
