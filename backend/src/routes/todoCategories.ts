import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as todoCategories from "../services/todoCategoriesService.js";
import { AppError } from "../utils/errors.js";

export const todoCategoriesRouter = Router();
todoCategoriesRouter.use(requireAuth, attachAccountId);

// Kontobreda kategorier (2026-07-07) — kräver ändå att servern vet VILKEN
// medlem som frågar, inte bara vilket konto (skrivoperationer spärrar mot
// barn-roller i todoCategoriesService.ts).
function requireMemberId(memberId: string | undefined): string {
  if (!memberId) {
    throw new AppError(401, "Medlems-id saknas");
  }
  return memberId;
}

todoCategoriesRouter.get("/", async (req, res) => {
  requireMemberId(req.memberId);
  res.json(await todoCategories.getAllCategories(req.accountId!));
});

todoCategoriesRouter.post("/", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  const category = await todoCategories.createCategory(req.accountId!, memberId, req.body?.name ?? "");
  res.status(201).json(category);
});

todoCategoriesRouter.patch("/:id", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  res.json(await todoCategories.renameCategory(req.params.id, req.accountId!, memberId, req.body?.name ?? ""));
});

todoCategoriesRouter.delete("/:id", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  res.json(await todoCategories.deleteCategory(req.params.id, req.accountId!, memberId));
});

todoCategoriesRouter.patch("/:id/hidden", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  res.json(await todoCategories.setCategoryHidden(req.params.id, req.accountId!, memberId, Boolean(req.body?.hidden)));
});
