import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { setupAccount, getAccount, updateAccount, exportAccount, deleteAccount } from "../controllers/accountsController.js";

export const accountsRouter = Router();

accountsRouter.post("/setup", requireAuth, setupAccount);
accountsRouter.get("/:id", getAccount);
accountsRouter.put("/:id", requireAuth, updateAccount);
accountsRouter.get("/:id/export", requireAuth, exportAccount);
accountsRouter.delete("/:id", requireAuth, deleteAccount);
