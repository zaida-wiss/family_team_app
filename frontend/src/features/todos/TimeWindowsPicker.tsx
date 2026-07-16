import "./TimeWindowsPicker.css";
import { Plus, Trash2 } from "lucide-react";
import type { TodoTimeWindow } from "@shared/types";
import { isoToTimeInput, timeToAnchorISO } from "./recurringTodos";

type Props = {
  windows: TodoTimeWindow[];
  onChange: (windows: TodoTimeWindow[]) => void;
  fixedTodoTimes?: boolean;
};

// Flera tidsintervall per dag på samma återkommande uppgift (2026-07-05,
// Zaidas önskemål, t.ex. "borsta tänder" morgon OCH kväll som EN mall istället
// för två separata uppgifter). Bara meningsfull när uppgiften är återkommande
// — se TodoCreatorModal.tsx/TodoEditModal.tsx som bara visar den då.
export function TimeWindowsPicker({ windows, onChange, fixedTodoTimes = false }: Props) {
  function addWindow() {
    onChange([...windows, { visibleFrom: null, expiresAt: null }]);
  }

  function removeWindow(index: number) {
    onChange(windows.filter((_, i) => i !== index));
  }

  function updateStart(index: number, hhmm: string) {
    onChange(windows.map((w, i) => (i === index ? { ...w, visibleFrom: timeToAnchorISO(hhmm, fixedTodoTimes) } : w)));
  }

  function updateEnd(index: number, hhmm: string) {
    onChange(windows.map((w, i) => (i === index ? { ...w, expiresAt: timeToAnchorISO(hhmm, fixedTodoTimes) } : w)));
  }

  return (
    <div className="field-label">
      <span>Tider</span>
      <ul className="time-windows-picker__list">
        {windows.map((window, index) => (
          <li className="time-windows-picker__row" key={index}>
            <input
              aria-label="Från kl."
              className="text-input"
              onChange={(e) => updateStart(index, e.target.value)}
              type="time"
              value={isoToTimeInput(window.visibleFrom, fixedTodoTimes)}
            />
            <span aria-hidden="true">–</span>
            <input
              aria-label="Till kl."
              className="text-input"
              onChange={(e) => updateEnd(index, e.target.value)}
              type="time"
              value={isoToTimeInput(window.expiresAt, fixedTodoTimes)}
            />
            {windows.length > 1 && (
              <button
                aria-label="Ta bort tid"
                className="icon-button"
                onClick={() => removeWindow(index)}
                type="button"
              >
                <Trash2 size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button className="secondary-button" onClick={addWindow} type="button">
        <Plus size={14} />
        Lägg till tid
      </button>
    </div>
  );
}
