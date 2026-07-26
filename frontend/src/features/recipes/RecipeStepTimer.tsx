import "./RecipesView.css";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type Props = {
  timedMinutes: number;
  timerStartedAt: string;
  onClear: () => void;
};

function format(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Egen, liten motsvarighet till todos/SubtaskCountdown.tsx — INTE
// återanvänd rakt av, den komponenten refererar CSS-klasser definierade i
// en annan lazy-laddad panels CSS-fil (samma cross-chunk-CSS-fälla som
// redan dokumenterats för HouseholdSecretsSettings/receptmodalerna
// 2026-07-25/26). Samma "räkna om från en absolut tidsstämpel"-princip,
// bara med Recipes egna klassnamn.
export function RecipeStepTimer({ timedMinutes, timerStartedAt, onClear }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const endsAt = new Date(timerStartedAt).getTime() + timedMinutes * 60_000;
  const remaining = endsAt - now;
  const done = remaining <= 0;

  return (
    <span className={"recipe-detail__step-timer-running" + (done ? " recipe-detail__step-timer-running--done" : "")}>
      ⏱ {done ? "Klart!" : format(remaining)}
      <button aria-label="Stäng timern" className="icon-button" onClick={onClear} type="button">
        <X size={14} />
      </button>
    </span>
  );
}
