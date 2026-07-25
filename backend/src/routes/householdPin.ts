import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as householdPin from "../services/householdPinService.js";

export const householdPinRouter = Router();
householdPinRouter.use(requireAuth, attachAccountId);

householdPinRouter.get("/", async (req, res) => {
  res.json(await householdPin.getHouseholdPinStatus(req.accountId!, req.memberId ?? null));
});

householdPinRouter.put("/", async (req, res) => {
  res.json(await householdPin.setHouseholdPin(req.accountId!, req.memberId ?? null, req.body));
});

householdPinRouter.post("/verify", async (req, res) => {
  res.json(await householdPin.verifyHouseholdPin(req.accountId!, req.memberId ?? null, req.body));
});
