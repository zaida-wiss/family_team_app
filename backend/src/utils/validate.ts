import { z } from "zod";

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const err = new Error(result.error.errors[0]?.message ?? "Ogiltiga värden");
    (err as { status?: number }).status = 400;
    throw err;
  }
  return result.data;
}
