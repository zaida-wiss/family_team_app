import "./ChildRecordsPage.css";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Id, TimedTaskWithBest } from "@shared/types";
import { ChildTimedTasksSection } from "./ChildTimedTasksSection";

type Props = {
  themeName: string;
  timedTasks: TimedTaskWithBest[];
  onRecordAttempt: (id: Id, durationMs: number) => Promise<{ isNewRecord: boolean }>;
  onBack: () => void;
};

// Egen sida för Medaljer/Rekord (2026-07-06, Zaidas beslut) — låg tidigare
// alltid synlig inline längst ner i ChildDashboard, nås nu via en pokal-knapp
// till vänster om profilbilden i ChildHero istället. Egen 1s-tickande klocka
// här (självständig från ChildDashboard:s, eftersom sidorna är ömsesidigt
// uteslutande — bara en av dem är monterad åt gången).
export function ChildRecordsPage({ themeName, timedTasks, onRecordAttempt, onBack }: Props) {
  const [timerNow, setTimerNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <article className={`child-dashboard child-records-page theme-${themeName}`}>
      <header className="child-records-page__header">
        <button
          aria-label="Tillbaka"
          className="child-records-page__back"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={22} />
        </button>
        <h2 className="section-title">🏆 Rekord</h2>
      </header>

      <div className="child-records-page__body">
        <ChildTimedTasksSection
          timedTasks={timedTasks}
          timerNow={timerNow}
          onRecordAttempt={onRecordAttempt}
        />
      </div>
    </article>
  );
}
