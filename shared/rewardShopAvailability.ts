import type { Id, RewardShopItem, Todo } from "./types.js";

/**
 * Vilka av varans obligatoriska kategorier som fortfarande blockerar köpet.
 *
 * Regel: bara uppgifter som VISAS PÅ DASHBOARDEN JUST NU blockerar.
 * Ett uppdrag som missades igår eller vars tidsfönster (visibleFrom/expiresAt)
 * har passerat räknas inte — det syns inte på dashboarden och ska inte spela roll.
 *
 * requireApproval=true  → barnet måste ha fått uppgiften godkänd av förälder (status=approved)
 * requireApproval=false → det räcker att barnet markerat den som avklarad (status ≠ pending)
 *
 * Ren epoch-ms-jämförelse (from/until) — tidszonsoberoende, säker att köra på både
 * klient och server oavsett vilken tidszon respektive process kör i.
 */
export function blockingCategories(
  item: RewardShopItem,
  todos: Todo[],
  childId: Id,
  requireApproval = false,
  now = Date.now()
): Id[] {
  if ((item.requiredCategories ?? []).length === 0) return [];

  const unresolved = new Set(
    todos
      .filter((t) => {
        if (t.assignedTo !== childId) return false;
        if (t.deletedAt !== null) return false;
        if (!t.personalCategoryId) return false;
        if (!item.requiredCategories.includes(t.personalCategoryId)) return false;

        const from = t.visibleFrom ? new Date(t.visibleFrom).getTime() : Number.NEGATIVE_INFINITY;
        const until = t.expiresAt ? new Date(t.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        if (!(from <= now && now < until)) return false;

        return requireApproval ? t.status !== "approved" : t.status === "pending";
      })
      .map((t) => t.personalCategoryId as Id)
  );

  return [...unresolved];
}
