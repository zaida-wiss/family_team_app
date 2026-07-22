import styles from "./TrashView.module.css";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { hasPermission } from "../../utils/permissions";
import { getDeletedItemsForTrash } from "./trash";
import type { Calendar, Id, Member, Role, ShoppingList, Todo } from "@shared/types";

type TrashViewProps = {
  calendars: Calendar[];
  currentMember: Member;
  members: Member[];
  roles: Role[];
  shoppingLists: ShoppingList[];
  todos: Todo[];
  onRestoreCalendar: (calendarId: Id) => void;
  onRestoreMember: (memberId: Id) => void;
  onRestoreShoppingList: (listId: Id) => void;
  onRestoreTodo: (todoId: Id) => void;
  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  onPurgeAllTrash: () => Promise<void>;
};

export function TrashView({
  calendars,
  currentMember,
  members,
  onRestoreCalendar,
  onRestoreShoppingList,
  onRestoreTodo,
  roles,
  shoppingLists,
  todos,
  onRestoreMember,
  onPurgeAllTrash
}: TrashViewProps) {
  const canViewTrash = hasPermission(currentMember, roles, "canViewTrash");
  const canRestore = hasPermission(currentMember, roles, "canRestoreFromTrash");
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  if (!canViewTrash) {
    return null;
  }

  async function handlePurge() {
    if (!confirmPurge) {
      setConfirmPurge(true);
      return;
    }
    setPurgeError(null);
    setPurging(true);
    try {
      await onPurgeAllTrash();
      setConfirmPurge(false);
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setPurging(false);
    }
  }

  const deletedMembers = getDeletedItemsForTrash(members, currentMember, roles);
  const deletedShoppingLists = getDeletedItemsForTrash(shoppingLists, currentMember, roles);
  const deletedCalendars = getDeletedItemsForTrash(calendars, currentMember, roles);
  const deletedTodos = getDeletedItemsForTrash(todos, currentMember, roles);

  const isTrashEmpty =
    deletedMembers.length === 0 &&
    deletedShoppingLists.length === 0 &&
    deletedCalendars.length === 0 &&
    deletedTodos.length === 0;

  return (
    <article className={styles.trashView}>
      <header className="section-header">
        <div>
          <p className="eyebrow">Papperskorg</p>
          <h2>Raderade saker</h2>
        </div>
        <Trash2 size={24} />
      </header>

      {isTrashEmpty ? (
        <p className="empty-note">Papperskorgen är tom.</p>
      ) : (
        <>
          {canRestore && (
            <div className={styles.purgeRow}>
              <button
                className={`secondary-button danger-action${confirmPurge ? " confirming" : ""}`}
                disabled={purging}
                onClick={handlePurge}
                type="button"
              >
                <Trash2 size={16} />
                {purging
                  ? "…"
                  : confirmPurge
                    ? "Bekräfta — går inte att ångra"
                    : "Töm papperskorgen permanent"}
              </button>
              {confirmPurge && !purging && (
                <p className="field-hint">
                  Tar bort allt i papperskorgen helt ur databasen. Går inte att ångra.
                </p>
              )}
              {purgeError && <p className="field-hint" role="alert">{purgeError}</p>}
            </div>
          )}
          <div className={styles.trashList}>
          {deletedMembers.map((member) => (
            <div className={styles.trashRow} key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <small>
                  Medlem raderad {formatDeletedAt(member.deletedAt)} av{" "}
                  {getMemberName(member.deletedBy, members)}
                </small>
              </div>

              <button
                className="secondary-button"
                disabled={!canRestore}
                onClick={() => onRestoreMember(member.id)}
                type="button"
              >
                <RotateCcw size={16} />
                Återställ
              </button>
            </div>
          ))}

          {deletedShoppingLists.map((list) => (
            <div className={styles.trashRow} key={list.id}>
              <div>
                <strong>{list.name}</strong>
                <small>
                  Inköpslista raderad {formatDeletedAt(list.deletedAt)} av{" "}
                  {getMemberName(list.deletedBy, members)}
                </small>
              </div>

              <button
                className="secondary-button"
                disabled={!canRestore}
                onClick={() => onRestoreShoppingList(list.id)}
                type="button"
              >
                <RotateCcw size={16} />
                Återställ
              </button>
            </div>
          ))}

          {deletedCalendars.map((calendar) => (
            <div className={styles.trashRow} key={calendar.id}>
              <div>
                <strong>{calendar.name}</strong>
                <small>
                  Kalender raderad {formatDeletedAt(calendar.deletedAt)} av{" "}
                  {getMemberName(calendar.deletedBy, members)}
                </small>
              </div>

              <button
                className="secondary-button"
                disabled={!canRestore}
                onClick={() => onRestoreCalendar(calendar.id)}
                type="button"
              >
                <RotateCcw size={16} />
                Återställ
              </button>
            </div>
          ))}

          {deletedTodos.map((todo) => (
            <div className={styles.trashRow} key={todo.id}>
              <div>
                <strong>{todo.title}</strong>
                <small>
                  Todo raderad {formatDeletedAt(todo.deletedAt)} av{" "}
                  {getMemberName(todo.deletedBy, members)}
                </small>
              </div>

              <button
                className="secondary-button"
                disabled={!canRestore}
                onClick={() => onRestoreTodo(todo.id)}
                type="button"
              >
                <RotateCcw size={16} />
                Återställ
              </button>
            </div>
          ))}
          </div>
        </>
      )}
    </article>
  );
}

function formatDeletedAt(deletedAt: string | null) {
  if (!deletedAt) {
    return "";
  }

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(deletedAt));
}

function getMemberName(memberId: Id | null, members: Member[]) {
  if (!memberId) {
    return "okänd";
  }

  return members.find((member) => member.id === memberId)?.name ?? "okänd";
}
