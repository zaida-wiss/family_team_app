import type { PaginatedAuditLog } from "@shared/types";
import { api, request } from "./client";

export const auditLogApi = {
  getPage: (page: number) => request<PaginatedAuditLog>(api(`audit-log?page=${page}`)),
};
