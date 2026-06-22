import { RotateCcw, Trash2 } from "lucide-react";
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
  onRestoreMember
}: TrashViewProps) {
  const canViewTrash = hasPermission(currentMember, roles, "canViewTrash");
  const canRestore = hasPermission(currentMember, roles, "canRestoreFromTrash");

  if (!canViewTrash) {
    return null;
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
    <article className="trash-view">
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
        <div className="trash-list">
          {deletedMembers.map((member) => (
            <div className="trash-row" key={member.id}>
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
            <div className="trash-row" key={list.id}>
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
            <div className="trash-row" key={calendar.id}>
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
            <div className="trash-row" key={todo.id}>
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
