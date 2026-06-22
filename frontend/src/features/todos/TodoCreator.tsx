import { PlusCircle } from "lucide-react";
import { useState } from "react";
import { hasPermission } from "../../utils/permissions";
import type { Id, Member, RecurrenceRule, Role, Todo } from "@shared/types";

type TodoCreatorProps = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  onCreateTodo: (todo: Todo) => void;
};

export function TodoCreator({
  currentMember,
  members,
  roles,
  onCreateTodo
}: TodoCreatorProps) {
  const assignableMembers = members.filter((member) => member.deletedAt === null);
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState<Id | "shared">(
    assignableMembers[0]?.id ?? "shared"
  );
  const [starValue, setStarValue] = useState(1);
  const [visual, setVisual] = useState("Star");
  const [recurrenceType, setRecurrenceType] =
    useState<RecurrenceRule["type"]>("none");
  const [visibleFrom, setVisibleFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const canCreateTodo = hasPermission(currentMember, roles, "canCreateTodos");
  const canSchedule = hasPermission(
    currentMember,
    roles,
    "canScheduleRecurringTodos"
  );

  function createTodo() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || !canCreateTodo) {
      return;
    }

    onCreateTodo({
      id: `todo-${crypto.randomUUID()}`,
      title: trimmedTitle,
      createdBy: currentMember.id,
      assignedTo: assignedTo === "shared" ? null : assignedTo,
      isShared: assignedTo === "shared",
      status: "pending",
      starValue,
      visual: {
        type: "lucide-icon",
        value: visual.trim() || "Star"
      },
      recurrence: createRecurrence(recurrenceType),
      recurringSourceId: null,
      occurrenceDate: null,
      visibleFrom: visibleFrom ? toDateTimeString(visibleFrom) : null,
      expiresAt: expiresAt ? toDateTimeString(expiresAt) : null,
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      deletedAt: null,
      deletedBy: null
    });

    setTitle("");
    setStarValue(1);
    setVisual("Star");
    setRecurrenceType("none");
    setVisibleFrom("");
    setExpiresAt("");
  }

  return (
    <section className="todo-creator" aria-label="Skapa todo">
      <div className="todo-creator-header">
        <div>
          <p className="eyebrow">Ny uppgift</p>
          <h3>Skapa todo</h3>
        </div>
        <PlusCircle size={22} />
      </div>

      <div className="todo-creator-grid">
        <label className="field-label">
          Titel
          <input
            className="text-input"
            disabled={!canCreateTodo}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Till exempel Bädda sängen"
            value={title}
          />
        </label>

        <label className="field-label">
          Tilldelas
          <select
            className="text-input"
            disabled={!canCreateTodo}
            onChange={(event) => setAssignedTo(event.target.value)}
            value={assignedTo}
          >
            <option value="shared">Gemensam</option>
            {assignableMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Stjärnor
          <input
            className="text-input"
            disabled={!canCreateTodo}
            min="0"
            onChange={(event) => setStarValue(Number(event.target.value))}
            type="number"
            value={starValue}
          />
        </label>

        <label className="field-label">
          Bild/ikon
          <input
            className="text-input"
            disabled={!canCreateTodo}
            onChange={(event) => setVisual(event.target.value)}
            placeholder="Star, BookOpen, Bed"
            value={visual}
          />
        </label>

        <label className="field-label">
          Återkommer
          <select
            className="text-input"
            disabled={!canCreateTodo || !canSchedule}
            onChange={(event) =>
              setRecurrenceType(event.target.value as RecurrenceRule["type"])
            }
            value={recurrenceType}
          >
            <option value="none">Inte återkommande</option>
            <option value="weekly">Veckovis vardagar</option>
            <option value="interval">Varje vecka</option>
          </select>
        </label>

        <label className="field-label">
          Syns från
          <input
            className="text-input"
            disabled={!canCreateTodo}
            onChange={(event) => setVisibleFrom(event.target.value)}
            type="datetime-local"
            value={visibleFrom}
          />
        </label>

        <label className="field-label">
          Försvinner
          <input
            className="text-input"
            disabled={!canCreateTodo}
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            value={expiresAt}
          />
        </label>
      </div>

      <button
        className="primary-button"
        disabled={!canCreateTodo}
        onClick={createTodo}
        type="button"
      >
        Skapa todo
      </button>
    </section>
  );
}

function createRecurrence(type: RecurrenceRule["type"]): RecurrenceRule {
  if (type === "weekly") {
    return {
      type: "weekly",
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"]
    };
  }

  if (type === "interval") {
    return {
      type: "interval",
      every: 1,
      unit: "week"
    };
  }

  return { type: "none" };
}

function toDateTimeString(value: string) {
  return new Date(value).toISOString();
}
