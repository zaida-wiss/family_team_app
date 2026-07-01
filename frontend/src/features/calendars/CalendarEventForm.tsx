import { useState } from "react";
import { Plus } from "lucide-react";
import type { AddEventInput } from "./useCalendarsState";
import styles from "./CalendarPanel.module.css";

type Props = {
  canEdit: boolean;
  onAddEvent: (event: AddEventInput) => void;
};

export function CalendarEventForm({ canEdit, onAddEvent }: Props) {
  const [eventTitle, setEventTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  function addEvent() {
    const title = eventTitle.trim();
    if (!title || !startsAt || !endsAt || !canEdit) return;
    onAddEvent({ title, startsAt, endsAt, isAllDay: false, notes: null });
    setEventTitle(""); setStartsAt(""); setEndsAt("");
  }

  return (
    <section className={styles.toolCard} aria-label="Lägg till kalenderhändelse">
      <div className="calendar-event-form">
        <input
          className="text-input"
          disabled={!canEdit}
          onChange={(e) => setEventTitle(e.target.value)}
          placeholder="Händelse"
          value={eventTitle}
        />
        <input
          className="text-input"
          disabled={!canEdit}
          onChange={(e) => setStartsAt(e.target.value)}
          type="datetime-local"
          value={startsAt}
        />
        <input
          className="text-input"
          disabled={!canEdit}
          onChange={(e) => setEndsAt(e.target.value)}
          type="datetime-local"
          value={endsAt}
        />
        <button
          aria-label="Lägg till händelse"
          className="icon-button"
          disabled={!canEdit}
          onClick={addEvent}
          type="button"
        >
          <Plus size={16} />
        </button>
      </div>
    </section>
  );
}
