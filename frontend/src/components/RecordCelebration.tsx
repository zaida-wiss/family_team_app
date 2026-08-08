import { useEffect } from "react";
import { Trophy } from "lucide-react";
import "./RecordCelebration.css";

// Rekord-firande (2026-08-09, Zaidas önskemål: "skulle det kunna komma en
// pokal med tiden över skärmen då? och att det blinkar lite grönt i
// bakgrunden") — visas när en ÖPPEN tidtagen uppgift (Timer aktiverad, ingen
// Planerad tid) avklaras med ett nytt personbästa (todosService.ts:s
// recordAutoTimedAttempt, se useTodosState.ts:s completeTodo). Renderas EN
// gång på Shell.tsx-nivå, oavsett vilken av barnets/vuxnas/familjens vyer
// uppgiften avklarades ifrån.
const AUTO_DISMISS_MS = 4000;

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")} min` : `${seconds} sek`;
}

type Props = {
  title: string;
  elapsedMs: number;
  onDismiss: () => void;
};

export function RecordCelebration({ title, elapsedMs, onDismiss }: Props) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onDismiss]);

  return (
    <div
      aria-live="polite"
      className="record-celebration"
      onClick={onDismiss}
      role="status"
    >
      <div className="record-celebration__card">
        <Trophy className="record-celebration__trophy" size={72} />
        <p className="record-celebration__heading">Nytt rekord!</p>
        <p className="record-celebration__task">{title}</p>
        <p className="record-celebration__time">{formatElapsed(elapsedMs)}</p>
      </div>
    </div>
  );
}
