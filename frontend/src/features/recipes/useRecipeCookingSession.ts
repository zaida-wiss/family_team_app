import { useEffect, useState } from "react";

type CookingSession = {
  checkedStepIds: string[];
  timerStepId: string | null;
  timerStartedAt: string | null;
};

const EMPTY: CookingSession = { checkedStepIds: [], timerStepId: null, timerStartedAt: null };

function storageKey(recipeId: string) {
  return `recipe-cooking-${recipeId}`;
}

// "Följ steg för steg"-läge i receptets visa-vy (2026-07-26, Zaidas
// önskemål: kryssrutor per steg, en timer "som inte bryts när man växlar
// mellan olika sidor"). Ligger i localStorage, INTE i vanlig useState i
// RecipeDetailView.tsx — den komponenten avmonteras helt så fort man
// stänger receptet eller byter panel (t.ex. till Todos och tillbaka), och
// localStorage är det enda som pålitligt överlever det. Timern lagras som
// en ABSOLUT tidsstämpel (samma "klienten mäter, räknar om från en
// tidsstämpel"-princip som SubtaskCountdown/ADR-0018) — en åternmontering
// räknar bara om kvarvarande tid, ingen risk att en `setInterval` nollställs
// och tappar bort hur långt timern hunnit.
export function useRecipeCookingSession(recipeId: string) {
  const [session, setSession] = useState<CookingSession>(() => {
    try {
      const raw = localStorage.getItem(storageKey(recipeId));
      return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
    } catch {
      return EMPTY;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(recipeId), JSON.stringify(session));
    } catch {
      // localStorage kan vara fullt/otillgängligt (privat läge m.m.) — då
      // fungerar "följ steg för steg" bara för den aktuella sessionen,
      // ingen anledning att krascha eller visa ett fel för detta.
    }
  }, [recipeId, session]);

  function toggleStep(stepId: string) {
    setSession((s) => ({
      ...s,
      checkedStepIds: s.checkedStepIds.includes(stepId)
        ? s.checkedStepIds.filter((id) => id !== stepId)
        : [...s.checkedStepIds, stepId]
    }));
  }

  function startTimer(stepId: string) {
    setSession((s) => ({ ...s, timerStepId: stepId, timerStartedAt: new Date().toISOString() }));
  }

  function clearTimer() {
    setSession((s) => ({ ...s, timerStepId: null, timerStartedAt: null }));
  }

  return {
    checkedStepIds: session.checkedStepIds,
    timerStepId: session.timerStepId,
    timerStartedAt: session.timerStartedAt,
    toggleStep,
    startTimer,
    clearTimer
  };
}
