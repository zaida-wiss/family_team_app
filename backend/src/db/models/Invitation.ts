import { Schema, model } from "mongoose";
import { z } from "zod";
import type { Invitation } from "../../../../shared/types.js";

const invitationSchema = new Schema<Invitation>({
  id: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  invitedEmail: { type: String, required: true, lowercase: true, trim: true },
  invitedByMemberId: { type: String, required: true },
  memberName: { type: String, required: true },
  roleId: { type: String, required: true },
  isChild: { type: Boolean, required: true },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ["pending", "accepted", "expired"], default: "pending" },
  createdAt: { type: String, required: true },
  expiresAt: { type: String, required: true }
});

export const InvitationModel = model<Invitation>("Invitation", invitationSchema);

export const createInvitationSchema = z.object({
  invitedEmail: z.string().email("Ogiltig e-postadress"),
  memberName: z.string().min(1, "Namn krävs").max(60),
  roleId: z.string().min(1),
  isChild: z.boolean()
});
