import { Router } from "express";
import { requireCronSecret } from "../middleware/auth.js";
import { purgeExpiredAccounts } from "../services/accountsService.js";

export const adminRouter = Router();

// Anropas av ett schemalagt jobb (Render Cron Job), inte av en inloggad användare.
// Hard-raderar konton vars 30-dagars GDPR-gallringsfönster (deleteAccount, ADR-0007)
// har löpt ut.
adminRouter.post("/purge-expired-accounts", requireCronSecret, async (_req, res) => {
  const result = await purgeExpiredAccounts();
  res.json({ ok: true, ...result });
});
