import styles from "./TrashView.module.css";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { hasPermission } from "../../utils/permissions";
import { getDeletedItemsForTrash } from "./trash";
import { useTodosHistoryState } from "../todos/useTodosHistoryState";
import type { Calendar, Id, Member, Role, ShoppingList } from "@shared/types";

type TrashViewProps = {
  calendars: Calendar[];
  currentMember: Member;
  members: Member[];
  roles: Role[];
  shoppingLists: ShoppingList[];
  onRestoreCalendar: (calendarId: Id) => void;
  onRestoreMember: (memberId: Id) => void;
  onRestoreShoppingList: (listId: Id) => void;
  onRestoreTodo: (todoId: Id) => void;
  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  onPurgeAllTrash: () => Promise<void>;
  // Samma ADR-0025-undantag, per rad (2026-08-05) — se handlePurgeTodo nedan.
  onPurgeTodo: (todoId: Id) => Promise<void>;
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
  onRestoreMember,
  onPurgeAllTrash,
  onPurgeTodo
}: TrashViewProps) {
  const canViewTrash = hasPermission(currentMember, roles, "canViewTrash");
  const canRestore = hasPermission(currentMember, roles, "canRestoreFromTrash");
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  // Radera permanent per todo-rad (2026-08-05, Zaidas önskemål: "möjlighet
  // att ångra eller att göra en hard delete" — bulk-tömningen ovan var
  // tidigare allt-eller-inget, ingen väg att permanent radera EN specifik
  // rad). Samma tvåstegs-bekräftelsemönster som bulk-knappen, men bara EN
  // rad kan vara i bekräftelseläge åt gången.
  const [confirmPurgeTodoId, setConfirmPurgeTodoId] = useState<Id | null>(null);
  const [purgingTodoId, setPurgingTodoId] = useState<Id | null>(null);
  const [purgeTodoError, setPurgeTodoError] = useState<string | null>(null);
  // Todos-delen av papperskorgen är paginerad (2026-07-26) — samma nya
  // GET /api/todos/history som Todo-historik-fliken använder, filtrerad
  // till bara mjuk-raderade nedan. Medlemmar/inköpslistor/kalendrar är
  // fortsatt ofiltrerade, redan hämtade arrayer via props — bara todos-
  // volymen var det egentliga problemet, se todosService.ts:s kommentar.
  const {
    items: todoHistoryItems,
    total: todoHistoryTotal,
    loading: todoHistoryLoading,
    loadMore: loadMoreTodoTrash,
    refetch: refetchTodoTrash,
    removeItem: removeTodoTrashItem
  } = useTodosHistoryState();

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
      // ADR-0025 rör bara den centrala todos-listan — den lokalt hämtade
      // historik-/papperskorgssidan här måste hämtas om separat.
      refetchTodoTrash();
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setPurging(false);
    }
  }

  function handleRestoreTodo(todoId: Id) {
    onRestoreTodo(todoId);
    // restoreTodo (useTodosState.ts) är fire-and-forget mot den CENTRALA
    // todos-listan — ett refetch() här hade kunnat racea mot ett anrop som
    // inte hunnit landa, tas bort optimistiskt lokalt istället.
    removeTodoTrashItem(todoId);
  }

  async function handlePurgeTodo(todoId: Id) {
    if (confirmPurgeTodoId !== todoId) {
      setConfirmPurgeTodoId(todoId);
      setPurgeTodoError(null);
      return;
    }
    setPurgeTodoError(null);
    setPurgingTodoId(todoId);
    try {
      await onPurgeTodo(todoId);
      removeTodoTrashItem(todoId);
      setConfirmPurgeTodoId(null);
    } catch (err) {
      setPurgeTodoError(err instanceof Error ? err.message : "Något gick fel");
    } finally {
      setPurgingTodoId(null);
    }
  }

  const deletedMembers = getDeletedItemsForTrash(members, currentMember, roles);
  const deletedShoppingLists = getDeletedItemsForTrash(shoppingLists, currentMember, roles);
  const deletedCalendars = getDeletedItemsForTrash(calendars, currentMember, roles);
  const deletedTodos = getDeletedItemsForTrash(todoHistoryItems, currentMember, roles);
  const hasMoreTodoTrash = todoHistoryTotal !== null && todoHistoryItems.length < todoHistoryTotal;

  const isTrashEmpty =
    !todoHistoryLoading &&
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
            <div aria-label={todo.title} className={styles.trashRow} key={todo.id} role="group">
              <div>
                <strong>{todo.title}</strong>
                <small>
                  Todo raderad {formatDeletedAt(todo.deletedAt)} av{" "}
                  {getMemberName(todo.deletedBy, members)}
                </small>
                {confirmPurgeTodoId === todo.id && purgeTodoError && (
                  <p className="field-hint" role="alert">{purgeTodoError}</p>
                )}
              </div>

              <div className={styles.trashRowActions}>
                <button
                  className="secondary-button"
                  disabled={!canRestore}
                  onClick={() => handleRestoreTodo(todo.id)}
                  type="button"
                >
                  <RotateCcw size={16} />
                  Återställ
                </button>
                {/* Per-rad hard delete (2026-08-05, Zaidas önskemål: "möjlighet
                    att ångra eller att göra en hard delete") — samma
                    tvåstegs-bekräftelse som bulk-tömningen ovan, men bara
                    denna rad. */}
                <button
                  className={`secondary-button danger-action${confirmPurgeTodoId === todo.id ? " confirming" : ""}`}
                  disabled={!canRestore || purgingTodoId === todo.id}
                  onClick={() => handlePurgeTodo(todo.id)}
                  type="button"
                >
                  <Trash2 size={16} />
                  {purgingTodoId === todo.id
                    ? "…"
                    : confirmPurgeTodoId === todo.id
                      ? "Bekräfta"
                      : "Radera permanent"}
                </button>
              </div>
            </div>
          ))}
          </div>
          {hasMoreTodoTrash && (
            <button className="secondary-button" disabled={todoHistoryLoading} onClick={loadMoreTodoTrash} type="button">
              {todoHistoryLoading ? "Laddar…" : "Ladda fler raderade uppgifter"}
            </button>
          )}
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
