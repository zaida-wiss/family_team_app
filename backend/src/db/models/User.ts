import { Schema, model } from "mongoose";
import { z } from "zod";
import type { User } from "../../../../shared/types.js";

type UserDoc = User & { passwordHash: string; tokenVersion: number };

const userSchema = new Schema<UserDoc>({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 }
});

export const UserModel = model<UserDoc>("User", userSchema);

export const registerSchema = z.object({
  email: z.string().email("Ogiltig e-postadress"),
  password: z.string().min(8, "Lösenordet måste vara minst 8 tecken"),
  name: z.string().min(1, "Namn krävs").max(60)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});
