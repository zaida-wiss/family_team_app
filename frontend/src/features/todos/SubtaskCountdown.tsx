import { useEffect, useState } from "react";

type Props = {
  timedMinutes: number;
  timerStartedAt: string;
};

function format(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Recept-integration (2026-07-25, ADR-0028) — live nedräkning för ett
// tidsstyrt delmoment (t.ex. "sätt in i ugnen, 25 min"). Klienten mäter
// (samma "klienten mäter, ingen server-side pågående-status"-princip som
// ADR-0018), servern har bara stämplat timerStartedAt vid avbockning.
// Flashar grönt vid noll, samma flash-mönster som redan finns för nytt
// personbästa i Medaljer/Rekord.
export function SubtaskCountdown({ timedMinutes, timerStartedAt }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const endsAt = new Date(timerStartedAt).getTime() + timedMinutes * 60_000;
  const remaining = endsAt - now;
  const done = remaining <= 0;

  return (
    <span className={"todo-detail-modal__subtask-timer" + (done ? " todo-detail-modal__subtask-timer--done" : "")}>
      ⏱ {done ? "Klart!" : format(remaining)}
    </span>
  );
}
