import { Router, type Request, type Response } from "express";
import { requireCronSecret } from "../middleware/auth.js";
import { purgeExpiredAccounts } from "../services/accountsService.js";

export const adminRouter = Router();

// Anropas av en extern schemalagd pingtjänst (UptimeRobot), inte av en inloggad
// användare. Hard-raderar konton vars 30-dagars GDPR-gallringsfönster (deleteAccount,
// ADR-0007) har löpt ut. Svarar på både GET och POST eftersom UptimeRobots gratisnivå
// beror på monitortyp för vilken metod som faktiskt går att välja.
async function purgeHandler(_req: Request, res: Response) {
  const result = await purgeExpiredAccounts();
  res.json({ ok: true, ...result });
}

adminRouter.get("/purge-expired-accounts", requireCronSecret, purgeHandler);
adminRouter.post("/purge-expired-accounts", requireCronSecret, purgeHandler);
