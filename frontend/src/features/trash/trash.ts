import { hasPermission } from "../roles/permissions";
import type { Id, Member, Role } from "@shared/types";

export type SoftDeletedEntity = {
  deletedAt: string | null;
  deletedBy: Id | null;
};

export function markDeleted<T extends SoftDeletedEntity>(
  item: T,
  deletedBy: Id,
  deletedAt = new Date().toISOString()
): T {
  return {
    ...item,
    deletedAt,
    deletedBy
  };
}

export function restoreDeleted<T extends SoftDeletedEntity>(item: T): T {
  return {
    ...item,
    deletedAt: null,
    deletedBy: null
  };
}

export function getDeletedItemsForTrash<T extends SoftDeletedEntity>(
  items: T[],
  currentMember: Member,
  roles: Role[]
): T[] {
  if (!hasPermission(currentMember, roles, "canViewTrash")) {
    return [];
  }

  const canSeeAllTrash = hasPermission(
    currentMember,
    roles,
    "canRestoreFromTrash"
  );

  return items.filter((item) => {
    if (item.deletedAt === null) {
      return false;
    }

    if (canSeeAllTrash) {
      return true;
    }

    return item.deletedBy === currentMember.id;
  });
}
