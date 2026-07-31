import { useCallback, useEffect, useState } from "react";
import { mealPlanApi } from "../../api";
import type { MealPlanEntry, MealSlot } from "@shared/types";

// Vecko-måltidsplanering (2026-07-31) — ett av fyra flikval bredvid Hem-
// vyns familjefilter ("en måltidsplanering"). V1, medvetet enkel: bara
// MIN EGEN familjs plan (ingen delning med andra familjer/Familjeanslutningar
// än), ingen upprepning — varje dag+måltid sätts för sig.

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Måndag som veckans start, samma princip som RecurrencePicker.tsx:s
// veckodagar (mån,tis,...).
function startOfWeek(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export function useMealPlanState() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);

  const refresh = useCallback((start: Date) => {
    const from = toDateStr(start);
    const until = toDateStr(new Date(start.getTime() + 6 * 86_400_000));
    mealPlanApi.getRange(from, until).then(setEntries).catch(console.error);
  }, []);

  useEffect(() => {
    refresh(weekStart);
  }, [weekStart, refresh]);

  function goToPreviousWeek() {
    setWeekStart((w) => new Date(w.getTime() - 7 * 86_400_000));
  }
  function goToNextWeek() {
    setWeekStart((w) => new Date(w.getTime() + 7 * 86_400_000));
  }
  function goToToday() {
    setWeekStart(startOfWeek(new Date()));
  }

  async function createEntry(date: string, mealSlot: MealSlot, recipeId: string) {
    const created = await mealPlanApi.create(date, mealSlot, recipeId);
    setEntries((current) => [...current, created]);
  }

  async function removeEntry(id: string) {
    setEntries((current) => current.filter((e) => e.id !== id));
    await mealPlanApi.remove(id).catch(console.error);
  }

  return { weekStart, entries, goToPreviousWeek, goToNextWeek, goToToday, createEntry, removeEntry };
}
