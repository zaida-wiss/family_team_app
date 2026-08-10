import "./ChildRecordsPage.css";
import { ArrowLeft } from "lucide-react";
import type { Id, TimedTaskWithBest } from "@shared/types";
import type { TimedAttemptListItem } from "../../api/timedTasks";
import { ChildTimedTasksSection } from "./ChildTimedTasksSection";

type Props = {
  themeName: string;
  timedTasks: TimedTaskWithBest[];
  onRecordAttempt: (id: Id, durationMs: number, achievedAt: string) => Promise<{ isNewRecord: boolean }>;
  onListAttempts: (id: Id) => Promise<TimedAttemptListItem[]>;
  onDeleteAttempt: (id: Id, attemptId: Id) => Promise<void>;
  onBack: () => void;
};

// Egen sida för Medaljer/Rekord (2026-07-06, Zaidas beslut) — låg tidigare
// alltid synlig inline längst ner i ChildDashboard, nås nu via en pokal-knapp
// till vänster om profilbilden i ChildHero istället. Den tidigare egna
// 1s-tickande klockan här (bara vidarebefordrad till ChildTimedTasksSection)
// togs bort 2026-08-10 — den komponenten driver numera sin egen, snabbare
// klocka internt (useFastTick, för hundradels-visningen).
export function ChildRecordsPage({ themeName, timedTasks, onRecordAttempt, onListAttempts, onDeleteAttempt, onBack }: Props) {
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
          onRecordAttempt={onRecordAttempt}
          onListAttempts={onListAttempts}
          onDeleteAttempt={onDeleteAttempt}
        />
      </div>
    </article>
  );
}
