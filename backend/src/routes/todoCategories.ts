import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as todoCategories from "../services/todoCategoriesService.js";
import * as todoCategoryShares from "../services/todoCategorySharesService.js";
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
  const category = await todoCategories.createCategory(
    req.accountId!,
    memberId,
    req.body?.name ?? "",
    Boolean(req.body?.isFamily)
  );
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

todoCategoriesRouter.patch("/:id/exclude-from-week-overview", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  res.json(await todoCategories.setCategoryExcludeFromWeekOverview(
    req.params.id, req.accountId!, memberId, Boolean(req.body?.exclude)
  ));
});

// Dela EN kategori med en annan familj, icke-transitivt (2026-08-06, samma
// mönster som shopping.ts:s /:id/external-share, ADR-0026).
todoCategoriesRouter.get("/:id/external-share", async (req, res) => {
  res.json(await todoCategoryShares.listShares(req.params.id, req.accountId!, req.memberId ?? null));
});

todoCategoriesRouter.post("/:id/external-share/lookup", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  res.json(await todoCategoryShares.lookupShareCandidate(req.params.id, req.accountId!, req.memberId ?? null, email));
});

todoCategoriesRouter.post("/:id/external-share", async (req, res) => {
  const result = await todoCategoryShares.shareCategoryExternally(req.params.id, req.accountId!, req.memberId ?? null, req.body);
  res.status(201).json(result);
});

todoCategoriesRouter.delete("/:id/external-share/:granteeAccountId/:granteeMemberId", async (req, res) => {
  await todoCategoryShares.revokeExternalShare(
    req.params.id,
    req.accountId!,
    req.memberId ?? null,
    req.params.granteeMemberId,
    req.params.granteeAccountId
  );
  res.json({ ok: true });
});
