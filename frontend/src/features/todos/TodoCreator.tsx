import styles from "./TodoCreator.module.css";
import { PlusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasPermission } from "../../utils/permissions";
import { generateId } from "../../utils/uuid";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
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
  const assignableMembers = useMemo(() => {
    const childRoleIds = new Set(roles.filter((role) => role.isChildRole).map((role) => role.id));
    return members.filter((member) => {
      return (
        member.deletedAt === null &&
        (member.isChild || childRoleIds.has(member.roleId))
      );
    });
  }, [members, roles]);
  const [title, setTitle] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Id[]>([]);
  const [starValue, setStarValue] = useState(1);
  const [visual, setVisual] = useState("⭐");
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

  useEffect(() => {
    setSelectedMemberIds((current) => {
      const assignableIds = new Set(assignableMembers.map((member) => member.id));
      const stillAssignable = current.filter((memberId) => assignableIds.has(memberId));

      if (stillAssignable.length > 0 || assignableMembers.length === 0) {
        return stillAssignable;
      }

      return [assignableMembers[0].id];
    });
  }, [assignableMembers]);

  function createTodo() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || !canCreateTodo || selectedMemberIds.length === 0) {
      return;
    }

    const baseTodo = {
      id: `todo-${generateId()}`,
      title: trimmedTitle,
      createdBy: currentMember.id,
      status: "pending",
      starValue,
      visual: {
        type: "lucide-icon",
        value: visual || "⭐"
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
      rejectedReason: null,
      deletedAt: null,
      deletedBy: null
    } satisfies Omit<Todo, "assignedTo" | "isShared">;

    for (const memberId of selectedMemberIds) {
      onCreateTodo({
        ...baseTodo,
        id: `todo-${generateId()}`,
        assignedTo: memberId,
        isShared: false
      });
    }

    setTitle("");
    setStarValue(1);
    setVisual("⭐");
    setRecurrenceType("none");
    setVisibleFrom("");
    setExpiresAt("");
  }

  return (
    <section className={styles.todoCreator} aria-label="Skapa todo">
      <div className={styles.todoCreatorHeader}>
        <div>
          <p className="eyebrow">Ny uppgift</p>
          <h3>Skapa todo</h3>
        </div>
        <PlusCircle size={22} />
      </div>

      <div className={styles.todoCreatorGrid}>
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

        <fieldset className={`field-label ${styles.todoAssignees}`}>
          <legend>Tilldelas barn</legend>
          <div className={styles.todoAssigneeList}>
            {assignableMembers.map((member) => (
              <label className={styles.todoAssigneeOption} key={member.id}>
                <input
                  checked={selectedMemberIds.includes(member.id)}
                  disabled={!canCreateTodo}
                  onChange={() => toggleSelectedMember(member.id)}
                  type="checkbox"
                />
                <span>{member.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

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

        <div className="field-label">
          Emoji
          <EmojiPickerPortal
            symbol={visual}
            onSelect={setVisual}
          />
        </div>

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
        disabled={!canCreateTodo || selectedMemberIds.length === 0}
        onClick={createTodo}
        type="button"
      >
        Skapa todo
      </button>
    </section>
  );

  function toggleSelectedMember(memberId: Id) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    );
  }
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
