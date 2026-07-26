import { useEffect, useState } from "react";

type CookingSession = {
  checkedStepIds: string[];
  timerStepId: string | null;
  timerStartedAt: string | null;
  // Antal personer just DENNA gång (2026-07-26, Zaidas fråga: "kan jag
  // välja nu hur många personer jag ska tillaga för?") — oberoende av
  // receptets EGNA sparade Recipe.servings (satt i redigera-formuläret,
  // receptets normala/vanliga antal). null = inget eget val gjort, visa
  // receptets vanliga antal. Ändrar INTE ingrediensmängderna (fri text,
  // ingen strukturerad mängd/enhet att räkna om) — bara en räknare för hur
  // många man faktiskt lagar till just nu.
  servingsOverride: number | null;
};

const EMPTY: CookingSession = {
  checkedStepIds: [],
  timerStepId: null,
  timerStartedAt: null,
  servingsOverride: null
};

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

  function setServingsOverride(servings: number | null) {
    setSession((s) => ({ ...s, servingsOverride: servings }));
  }

  return {
    checkedStepIds: session.checkedStepIds,
    timerStepId: session.timerStepId,
    timerStartedAt: session.timerStartedAt,
    servingsOverride: session.servingsOverride,
    toggleStep,
    startTimer,
    clearTimer,
    setServingsOverride
  };
}
