import { useState } from "react";
import { X } from "lucide-react";
import type { Id, Member, Todo } from "@shared/types";
import { fmtTime } from "../calendars/calendarHelpers";
import { useModalA11y } from "../../hooks/useModalA11y";
import {
  WEEKDAYS,
  copyRoutineTemplate,
  findExistingRoutines,
  getRoutineDays,
  groupRoutines,
} from "./routineHelpers";
import "./CopyRoutinesModal.css";

type Props = {
  currentMember: Member;
  children: Member[];
  todos: Todo[];
  onCreateTodo: (todo: Todo) => void;
  onClose: () => void;
};

// Kopiera rutiner från ett barn till ett annat (2026-07-15, Zaidas önskemål:
// "kryssa i alla rutiner som ett nytt barn skall få från de befintliga
// barnens rutiner") — annars måste varje rutin öppnas och redigeras en och
// en (eller läggas till manuellt via mottagarkryssrutor). Visar bara
// rutiner käll-barnet har som mål-barnet ännu SAKNAR, så listan blir
// mindre för varje körning istället för att erbjuda dubbletter.
export function CopyRoutinesModal({ currentMember, children, todos, onCreateTodo, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);
  const [sourceChildId, setSourceChildId] = useState<Id | "">("");
  const [targetChildId, setTargetChildId] = useState<Id | "">("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const childIds = new Set(children.map((c) => c.id));
  const routineGroups = groupRoutines(findExistingRoutines(todos, childIds), children);

  const missingGroups =
    sourceChildId && targetChildId
      ? routineGroups.filter(
          (group) =>
            group.children.some((c) => c.id === sourceChildId) &&
            !group.children.some((c) => c.id === targetChildId)
        )
      : [];

  const allSelected = missingGroups.length > 0 && missingGroups.every((g) => selectedKeys.has(g.key));

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? new Set() : new Set(missingGroups.map((g) => g.key)));
  }

  function handleSourceChange(id: Id | "") {
    setSourceChildId(id);
    setSelectedKeys(new Set());
  }

  function handleTargetChange(id: Id | "") {
    setTargetChildId(id);
    setSelectedKeys(new Set());
  }

  function handleCopy() {
    if (!targetChildId || selectedKeys.size === 0) return;
    for (const group of missingGroups) {
      if (!selectedKeys.has(group.key)) continue;
      const sourceTodo = group.todos.find((t) => t.assignedTo === sourceChildId);
      if (!sourceTodo) continue;
      onCreateTodo(copyRoutineTemplate(sourceTodo, targetChildId, currentMember.id));
    }
    onClose();
  }

  return (
    <div className="copy-routines-overlay" onClick={onClose}>
      <div
        aria-labelledby="copy-routines-title"
        aria-modal="true"
        className="copy-routines-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="copy-routines-header">
          <h3 id="copy-routines-title">Kopiera rutiner</h3>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="copy-routines-pickers">
          <label className="field-label">
            Kopiera från
            <select
              className="text-input"
              onChange={(e) => handleSourceChange(e.target.value as Id)}
              value={sourceChildId}
            >
              <option value="">Välj barn…</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Till
            <select
              className="text-input"
              onChange={(e) => handleTargetChange(e.target.value as Id)}
              value={targetChildId}
            >
              <option value="">Välj barn…</option>
              {children.filter((c) => c.id !== sourceChildId).map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </select>
          </label>
        </div>

        {sourceChildId && targetChildId && (
          missingGroups.length === 0 ? (
            <p className="field-hint field-hint--neutral">
              Inget att kopiera — mottagaren har redan alla rutiner källan har.
            </p>
          ) : (
            <>
              <label className="copy-routines-select-all">
                <input checked={allSelected} onChange={toggleAll} type="checkbox" />
                Välj alla ({missingGroups.length})
              </label>
              <ul className="copy-routines-list">
                {missingGroups.map((group) => {
                  const t = group.todos.find((todo) => todo.assignedTo === sourceChildId) ?? group.todos[0];
                  return (
                    <li className="copy-routines-row" key={group.key}>
                      <label className="copy-routines-row-label">
                        <input
                          checked={selectedKeys.has(group.key)}
                          onChange={() => toggleKey(group.key)}
                          type="checkbox"
                        />
                        <span className="copy-routines-row-icon">{t.visual.value}</span>
                        <span className="copy-routines-row-title">{t.title}</span>
                        <span className="copy-routines-row-time">
                          {t.visibleFrom ? fmtTime(t.visibleFrom) : "--:--"}
                        </span>
                        <span className="copy-routines-row-days">
                          {WEEKDAYS.map(({ key, short }) => (
                            <span
                              key={key}
                              className={`copy-routines-day${getRoutineDays(t).includes(key) ? " copy-routines-day--on" : ""}`}
                            >
                              {short}
                            </span>
                          ))}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )
        )}

        <div className="copy-routines-actions">
          <button className="secondary-button" onClick={onClose} type="button">Avbryt</button>
          <button
            className="primary-button"
            disabled={selectedKeys.size === 0}
            onClick={handleCopy}
            type="button"
          >
            Kopiera {selectedKeys.size > 0 ? `(${selectedKeys.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
