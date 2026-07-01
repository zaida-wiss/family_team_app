import { useState } from "react";
import { Plus } from "lucide-react";
import styles from "./CalendarPanel.module.css";

type Props = {
  canCreate: boolean;
  defaultColor: string;
  onCreateCalendar: (name: string, color: string) => void;
};

export function CalendarCreateCard({ canCreate, defaultColor, onCreateCalendar }: Props) {
  const [calendarName, setCalendarName] = useState("");
  const [newCalendarColor, setNewCalendarColor] = useState(defaultColor);

  function createCalendar() {
    const name = calendarName.trim();
    if (!name || !canCreate) return;
    onCreateCalendar(name, newCalendarColor);
    setCalendarName("");
  }

  return (
    <section className={styles.createCard} aria-label="Skapa kalender">
      <div>
        <p className="eyebrow">Ny kalender</p>
        <h3>Skapa privat kalender</h3>
      </div>
      <div className={styles.createRow}>
        <input
          className={styles.colorInput}
          disabled={!canCreate}
          onChange={(e) => setNewCalendarColor(e.target.value)}
          title="Välj kalenderfärg"
          type="color"
          value={newCalendarColor}
        />
        <input
          className="text-input"
          disabled={!canCreate}
          onChange={(e) => setCalendarName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") createCalendar(); }}
          placeholder="Till exempel Min kalender"
          value={calendarName}
        />
        <button aria-label="Skapa kalender" className="icon-button" disabled={!canCreate} onClick={createCalendar} type="button">
          <Plus size={16} />
        </button>
      </div>
    </section>
  );
}
