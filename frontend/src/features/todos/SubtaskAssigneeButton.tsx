import "./SubtaskAssigneeButton.css";
import type { Member } from "@shared/types";

type Props = {
  assignedTo: string | null | undefined;
  members: Member[];
  onCycle: (nextId: string | null) => void;
};

// Delmoment kan tilldelas en familjemedlem (2026-07-23, Zaidas önskemål:
// "deluppgifter skall gå att assigna av familjemedlemmar på ett
// minimalistiskt och snyggt sätt så de blir färger som tillhör
// familjemedlemmen") — en enda liten cirkel per delmoment, klick cyklar
// igenom Ingen → medlem 1 → medlem 2 → ... → Ingen. Medvetet INTE ett eget
// popover/en hel dropdown per rad (skulle bryta mot CLAUDE.md:s
// minimalistiskt-princip för en redan tät checklista).
export function SubtaskAssigneeButton({ assignedTo, members, onCycle }: Props) {
  const currentIndex = members.findIndex((m) => m.id === assignedTo);
  const next = currentIndex === -1 ? (members[0] ?? null) : (members[currentIndex + 1] ?? null);
  const assignee = currentIndex === -1 ? null : members[currentIndex];

  return (
    <button
      aria-label={assignee ? `Tilldelad ${assignee.name}. Klicka för att byta.` : "Ingen tilldelad. Klicka för att tilldela."}
      className="subtask-assignee-btn"
      onClick={() => onCycle(next?.id ?? null)}
      style={assignee?.color ? { background: assignee.color, borderColor: assignee.color } : undefined}
      title={assignee ? assignee.name : "Ingen tilldelad"}
      type="button"
    >
      {assignee ? assignee.name.charAt(0).toUpperCase() : ""}
    </button>
  );
}
