import "./TimedTaskSettings.css";
import { useState } from "react";
import type { Member, TimedTaskWithBest } from "@shared/types";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";

type Props = {
  timedTasks: TimedTaskWithBest[];
  children: Member[];
  onCreate: (title: string, symbol: string | null, assignedTo: string) => void;
  onRemove: (id: string) => void;
};

function fmtDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

export function TimedTaskSettings({ timedTasks, children, onCreate, onRemove }: Props) {
  const [title, setTitle] = useState("");
  const [symbol, setSymbol] = useState("🏃");
  const [assignedTo, setAssignedTo] = useState(children[0]?.id ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !assignedTo) return;
    onCreate(title.trim(), symbol || null, assignedTo);
    setTitle("");
  }

  function childName(memberId: string) {
    return children.find((c) => c.id === memberId)?.name ?? "Okänt barn";
  }

  return (
    <section className="timed-task-settings">
      <p className="timed-task-settings__intro">
        Tidtagna uppgifter (t.ex. &quot;spring ett varv&quot;) — barnet startar och stoppar tiden själv, personbästa sparas automatiskt.
      </p>

      <form className="timed-task-settings__form" onSubmit={submit}>
        <div className="timed-task-settings__title-row">
          <EmojiPickerPortal symbol={symbol} onSelect={setSymbol} triggerClassName="timed-task-settings__emoji-btn" />
          <input
            className="text-input"
            placeholder="Uppgiftens namn"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <label className="field-label">
          Barn
          <select className="text-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            {children.map((child) => (
              <option key={child.id} value={child.id}>{child.name}</option>
            ))}
          </select>
        </label>

        <button type="submit" className="primary-button" disabled={children.length === 0}>
          Lägg till
        </button>
      </form>

      {timedTasks.length > 0 && (
        <ul className="timed-task-settings__list">
          {timedTasks.map((task) => (
            <li key={task.id} className="timed-task-settings__item">
              <span className="timed-task-settings__item-symbol">{task.symbol ?? "🏃"}</span>
              <div className="timed-task-settings__item-info">
                <span className="timed-task-settings__item-title">{task.title}</span>
                <small>
                  {childName(task.assignedTo)}
                  {task.bestDurationMs !== null
                    ? ` · Bästa: ${fmtDuration(task.bestDurationMs)} · ${task.attemptCount} försök`
                    : " · Inget rekord än"}
                </small>
              </div>
              <button
                aria-label={`Ta bort ${task.title}`}
                className="timed-task-settings__remove"
                onClick={() => onRemove(task.id)}
                type="button"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
