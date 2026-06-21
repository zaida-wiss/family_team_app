import { Schema, model } from "mongoose";
import type { ShoppingList } from "../../../../shared/types.js";

const shoppingListSchema = new Schema<ShoppingList>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  color: { type: String, required: true },
  icon: { type: String, default: null },
  ownerId: { type: String, required: true },
  sharedWith: [{ memberId: String, access: String }],
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null },
  items: [
    {
      id: { type: String, required: true },
      title: { type: String, required: true },
      createdBy: { type: String, required: true },
      done: { type: Boolean, required: true },
      deletedAt: { type: String, default: null },
      deletedBy: { type: String, default: null }
    }
  ]
});

export const ShoppingListModel = model<ShoppingList>("ShoppingList", shoppingListSchema);
