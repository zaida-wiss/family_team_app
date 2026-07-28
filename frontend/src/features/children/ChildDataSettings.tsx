import "./ChildSettings.css";
import { useState } from "react";
import { ChildRoutineCreator } from "./ChildRoutineCreator";
import { CopyRoutinesModal } from "./CopyRoutinesModal";
import { ChildShareSettings } from "./ChildShareSettings";
import { PendingChildShares } from "./PendingChildShares";
import { isChildMember } from "../todos/selectors";
import { hasPermission } from "../../utils/permissions";
import type { Id, Member, Role, Todo, TodoCategory } from "@shared/types";

// Utbruten ur ChildSettings.tsx (2026-07-28, Zaidas önskemål: "en som heter
// data. I data ska du kunna överföra barn, dela barn, ... kopiera uppgifter
// till ett annat barn och allt som har med datan att göra") — samlar det
// som redan fanns kringspritt (rutinkopiering, dela/överför barn) i en egen
// underkategori. Rutinernas EGNA todos hanteras här (skapa/redigera en
// mall), det är inte samma sak som "Data" i betydelsen "exportera" —
// GDPR-exporten är fortfarande kontobred (Inställningar → Konto), ingen
// per-barn-export finns ännu, se CLAUDE.md-fyndet samma dag.
type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  categories: TodoCategory[];
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onCreateTodo: (todo: Todo) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  onDeleteTodo: (todoId: Id) => void;
  fixedTodoTimes: boolean;
};

export function ChildDataSettings({
  currentMember,
  members,
  roles,
  todos,
  categories,
  onCreateCategory,
  onCreateTodo,
  onUpdateTodo,
  onRefreshRoutine,
  onDeleteTodo,
  fixedTodoTimes,
}: Props) {
  const [showCopyRoutines, setShowCopyRoutines] = useState(false);

  const childMembers = members.filter(
    (member) => member.accountId === currentMember.accountId && member.deletedAt === null && isChildMember(member, roles)
  );
  const canManageChildTodos = hasPermission(currentMember, roles, "canManageChildTodos");
  // Dela barn (ADR-0024) kräver samma canManageMembers som backend kollar
  // (canManageChildShares i shared/permissions.ts) — annars visas knappen
  // men serverns anrop 403:ar ändå, förvirrande.
  const canManageMembers = hasPermission(currentMember, roles, "canManageMembers");

  if (childMembers.length === 0) {
    return (
      <>
        <PendingChildShares />
        <div className="settings-sub">
          <h3 className="settings-sub-title">Data</h3>
          <p className="settings-sub-desc">Lägg till ett barn under Familjemedlemmar först.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PendingChildShares />
      {canManageChildTodos && (
        <div className="settings-sub">
          <h3 className="settings-sub-title">Rutiner</h3>
          {childMembers.length > 1 && (
            <button className="secondary-button" onClick={() => setShowCopyRoutines(true)} type="button">
              Kopiera rutiner från ett annat barn
            </button>
          )}
          {showCopyRoutines && (
            <CopyRoutinesModal
              currentMember={currentMember}
              children={childMembers}
              todos={todos}
              onCreateTodo={onCreateTodo}
              onClose={() => setShowCopyRoutines(false)}
            />
          )}
          <ChildRoutineCreator
            currentMember={currentMember}
            children={childMembers}
            roles={roles}
            todos={todos}
            categories={categories}
            onCreateCategory={onCreateCategory}
            showTitle={false}
            onCreateTodo={onCreateTodo}
            onUpdateTodo={onUpdateTodo}
            onRefreshRoutine={onRefreshRoutine}
            onDeleteTodo={onDeleteTodo}
            fixedTodoTimes={fixedTodoTimes}
          />
        </div>
      )}

      {canManageMembers && <ChildShareSettings childMembers={childMembers} />}
    </>
  );
}
