import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const rewardsRouter = Router();

rewardsRouter.use(requireAuth);

rewardsRouter.get("/", (_request, response) => {
  response.json({ message: "Hämta belöningar — ej implementerat" });
});

rewardsRouter.post("/", (_request, response) => {
  response.status(201).json({ message: "Skapa belöning — ej implementerat" });
});

rewardsRouter.patch("/:id/approve", (_request, response) => {
  response.json({ message: "Godkänn belöning — ej implementerat" });
});

rewardsRouter.patch("/:id/redeem", (_request, response) => {
  response.json({ message: "Lös in belöning — ej implementerat" });
});

rewardsRouter.patch("/:id/reject", (_request, response) => {
  response.json({ message: "Neka belöning — ej implementerat" });
});

rewardsRouter.delete("/:id", (_request, response) => {
  response.json({ message: "Ta bort belöning — ej implementerat" });
});
