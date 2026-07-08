import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { attachAccountId } from "../middleware/accountScope.js";
import * as todoTemplates from "../services/todoTemplatesService.js";
import { AppError } from "../utils/errors.js";
import { CreateTodoTemplateBodySchema, CreateTodoCategoryTemplateBodySchema } from "../../../shared/schemas.js";

export const todoTemplatesRouter = Router();
todoTemplatesRouter.use(requireAuth, attachAccountId);

function requireMemberId(memberId: string | undefined): string {
  if (!memberId) {
    throw new AppError(401, "Medlems-id saknas");
  }
  return memberId;
}

todoTemplatesRouter.get("/tasks", async (req, res) => {
  requireMemberId(req.memberId);
  res.json(await todoTemplates.getAllTaskTemplates(req.accountId!));
});

todoTemplatesRouter.post("/tasks", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  const task = CreateTodoTemplateBodySchema.parse(req.body);
  const template = await todoTemplates.createTaskTemplate(req.accountId!, memberId, task);
  res.status(201).json(template);
});

todoTemplatesRouter.delete("/tasks/:id", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  res.json(await todoTemplates.deleteTaskTemplate(req.params.id, req.accountId!, memberId));
});

todoTemplatesRouter.get("/categories", async (req, res) => {
  requireMemberId(req.memberId);
  res.json(await todoTemplates.getAllCategoryTemplates(req.accountId!));
});

todoTemplatesRouter.post("/categories", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  const body = CreateTodoCategoryTemplateBodySchema.parse(req.body);
  const template = await todoTemplates.createCategoryTemplate(req.accountId!, memberId, body.name, body.tasks);
  res.status(201).json(template);
});

todoTemplatesRouter.delete("/categories/:id", async (req, res) => {
  const memberId = requireMemberId(req.memberId);
  res.json(await todoTemplates.deleteCategoryTemplate(req.params.id, req.accountId!, memberId));
});
