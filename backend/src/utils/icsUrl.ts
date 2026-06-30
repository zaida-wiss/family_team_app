import { z } from "zod";
import { AppError } from "./errors.js";

const ICS_URL_SCHEMA = z
  .string()
  .min(1, "URL krävs")
  .refine(
    (v) => /^(https?|webcal):\/\/.+/i.test(v),
    "URL måste börja med http://, https:// eller webcal://"
  );

// RFC-1918 + link-local + loopback
const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1$)/i;
const PRIVATE_172_RE = /^172\.(1[6-9]|2\d|3[01])\./;

export function validateAndNormalizeIcsUrl(raw: unknown): string {
  const result = ICS_URL_SCHEMA.safeParse(raw);
  if (!result.success) {
    throw new AppError(400, result.error.errors[0]?.message ?? "Ogiltig URL");
  }

  const normalized = result.data.replace(/^webcal:\/\//i, "https://");

  let hostname: string;
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    throw new AppError(400, "Ogiltig URL");
  }

  if (PRIVATE_HOST_RE.test(hostname) || PRIVATE_172_RE.test(hostname)) {
    throw new AppError(400, "URL pekar på ett internt nätverk och är inte tillåten");
  }

  return normalized;
}
