import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMealPlanState } from "./useMealPlanState";
import type { MealSlot, Recipe } from "@shared/types";
import "./WeeklyMealPlan.css";

const DAY_NAMES = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Frukost",
  lunch: "Lunch",
  dinner: "Middag",
  snack: "Mellanmål"
};
const MEAL_SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

type Props = {
  recipes: Recipe[];
};

// Vecko-måltidsplanering (2026-07-31, Zaidas önskemål: "en måltidsplanering"
// — ett av fyra flikval bredvid Hem-vyns familjefilter). Kopplar ett
// redan existerande recept till en dag+måltid. V1, medvetet enkel: bara min
// egen familjs plan (visas bara när "Alla familjer"/min egen familj är
// vald i familjefiltret, se MemberOverview.tsx).
export function WeeklyMealPlan({ recipes }: Props) {
  const { weekStart, entries, goToPreviousWeek, goToNextWeek, goToToday, createEntry, removeEntry } =
    useMealPlanState();
  const [pickingCell, setPickingCell] = useState<{ date: string; slot: MealSlot } | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getTime() + i * 86_400_000);
    return { date: d.toISOString().slice(0, 10), label: DAY_NAMES[i], dayNumber: d.getDate() };
  });

  const recipeName = (recipeId: string) => recipes.find((r) => r.id === recipeId)?.name ?? "Okänt recept";

  async function handlePick(date: string, slot: MealSlot, recipeId: string) {
    setPickingCell(null);
    if (!recipeId) return;
    await createEntry(date, slot, recipeId);
  }

  return (
    <div className="mealplan">
      <div className="mealplan__toolbar">
        <button aria-label="Föregående vecka" className="icon-button" onClick={goToPreviousWeek} type="button">
          <ChevronLeft size={18} />
        </button>
        <button className="secondary-button" onClick={goToToday} type="button">
          Denna vecka
        </button>
        <button aria-label="Nästa vecka" className="icon-button" onClick={goToNextWeek} type="button">
          <ChevronRight size={18} />
        </button>
      </div>

      {recipes.length === 0 ? (
        <p className="empty-note">Inga recept ännu — lägg till ett i Recept-panelen för att kunna planera måltider.</p>
      ) : (
        <div className="mealplan__grid">
          {days.map((day) => (
            <div className="mealplan__day" key={day.date}>
              <div className="mealplan__day-header">
                {day.label} <span>{day.dayNumber}</span>
              </div>
              {MEAL_SLOT_ORDER.map((slot) => {
                const entry = entries.find((e) => e.date === day.date && e.mealSlot === slot);
                const isPicking = pickingCell?.date === day.date && pickingCell.slot === slot;
                return (
                  <div className="mealplan__slot" key={slot}>
                    <span className="mealplan__slot-label">{MEAL_SLOT_LABELS[slot]}</span>
                    {entry ? (
                      <div className="mealplan__entry">
                        <span>{recipeName(entry.recipeId)}</span>
                        <button
                          aria-label={`Ta bort ${recipeName(entry.recipeId)} från ${MEAL_SLOT_LABELS[slot].toLowerCase()} ${day.label}`}
                          onClick={() => removeEntry(entry.id)}
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : isPicking ? (
                      <select
                        autoFocus
                        className="text-input"
                        onBlur={() => setPickingCell(null)}
                        onChange={(e) => handlePick(day.date, slot, e.target.value)}
                        value=""
                      >
                        <option value="">Välj recept…</option>
                        {recipes.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        aria-label={`Lägg till recept för ${MEAL_SLOT_LABELS[slot].toLowerCase()} ${day.label}`}
                        className="mealplan__add"
                        onClick={() => setPickingCell({ date: day.date, slot })}
                        type="button"
                      >
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
