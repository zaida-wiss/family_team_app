import { CheckCircle2, Star, Trophy, XCircle } from "lucide-react";
import { ChildRoutineCreator } from "./ChildRoutineCreator";
import { hasPermission } from "../../utils/permissions";
import type { Id, Member, Reward, Role, Todo } from "@shared/types";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  rewards: Reward[];
  wishStars: Record<Id, number>;
  onSetWishStars: (rewardId: Id, stars: number) => void;
  onApproveTodo: (todoId: Id) => void;
  onRejectTodo: (todoId: Id) => void;
  onApproveWish: (rewardId: Id) => void;
  onRejectWish: (rewardId: Id) => void;
  onCreateTodo: (todo: Todo) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  onDeleteTodo: (todoId: Id) => void;
};

const WISH_STATUS_LABEL: Record<Reward["status"], string> = {
  suggested: "Väntar på godkännande",
  active: "Aktiv",
  unlocked: "Upplåst",
  redeemed: "Inlöst",
  rejected: "Nekad",
};

export function ChildSettings({
  currentMember,
  members,
  roles,
  todos,
  rewards,
  wishStars,
  onSetWishStars,
  onApproveTodo,
  onRejectTodo,
  onApproveWish,
  onRejectWish,
  onCreateTodo,
  onUpdateTodo,
  onRefreshRoutine,
  onDeleteTodo,
}: Props) {
  const childMembers = members.filter((member) => {
    const role = roles.find((candidate) => candidate.id === member.roleId);
    return (
      member.accountId === currentMember.accountId &&
      member.deletedAt === null &&
      (member.isChild || role?.isChildRole)
    );
  });
  const childIds = new Set(childMembers.map((child) => child.id));
  const childById = new Map(childMembers.map((child) => [child.id, child]));
  const canApprove = hasPermission(currentMember, roles, "canApproveTodos");
  const canManageChildTodos = hasPermission(currentMember, roles, "canManageChildTodos");

  const childWishes = rewards.filter(
    (reward) =>
      childIds.has(reward.wishedBy) &&
      reward.deletedAt === null &&
      reward.status !== "rejected"
  );
  const pendingTodos = todos.filter(
    (todo) =>
      childIds.has(todo.assignedTo ?? "") &&
      todo.status === "done" &&
      todo.deletedAt === null
  );
  const pendingWishes = rewards.filter(
    (reward) =>
      childIds.has(reward.wishedBy) &&
      reward.status === "suggested" &&
      reward.deletedAt === null
  );

  function getChildName(memberId: Id) {
    return childById.get(memberId)?.name ?? "Barn";
  }

  if (childMembers.length === 0) {
    return (
      <div className="settings-sub">
        <h3 className="settings-sub-title">Barn</h3>
        <p className="settings-sub-desc">Lägg till ett barn under Familjemedlemmar först.</p>
      </div>
    );
  }

  return (
    <>
      <div className="settings-sub">
        <h3 className="settings-sub-title">Önskningar</h3>
        {childWishes.length === 0 ? (
          <p className="settings-sub-desc">Inga önskningar ännu.</p>
        ) : (
          <section className="approval-panel child-settings-panel" aria-label="Barnens önskningar">
            {childWishes.map((reward) => (
              <div className="approval-row child-settings-row" key={reward.id}>
                <div>
                  <strong>{reward.title}</strong>
                  <small>
                    <Trophy size={14} />
                    {getChildName(reward.wishedBy)} · {reward.starsNeeded} stjärnor · {WISH_STATUS_LABEL[reward.status]}
                  </small>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      {canManageChildTodos && (
        <div className="settings-sub">
          <h3 className="settings-sub-title">Rutiner</h3>
          <ChildRoutineCreator
            currentMember={currentMember}
            children={childMembers}
            roles={roles}
            todos={todos}
            showTitle={false}
            onCreateTodo={onCreateTodo}
            onUpdateTodo={onUpdateTodo}
            onRefreshRoutine={onRefreshRoutine}
            onDeleteTodo={onDeleteTodo}
          />
        </div>
      )}

      <div className="settings-sub">
        <h3 className="settings-sub-title">Godkännande</h3>
        {!canApprove ? (
          <p className="settings-sub-desc">Din roll kan inte godkänna barns uppgifter.</p>
        ) : pendingTodos.length === 0 && pendingWishes.length === 0 ? (
          <p className="settings-sub-desc">Inget väntar på godkännande.</p>
        ) : (
          <section className="approval-panel child-settings-panel" aria-label="Barnens godkännanden">
            <div className="approval-header">
              <strong>Väntar</strong>
              <span>{pendingTodos.length + pendingWishes.length}</span>
            </div>

            {pendingTodos.map((todo) => (
              <div className="approval-row" key={todo.id}>
                <div>
                  <strong>{todo.title}</strong>
                  <small>
                    <Star size={14} fill="currentColor" />
                    {getChildName(todo.assignedTo ?? "")} · {todo.starValue} stjärnor
                  </small>
                </div>
                <div className="approval-actions">
                  <button className="icon-button" onClick={() => onApproveTodo(todo.id)} title="Godkänn" type="button">
                    <CheckCircle2 size={16} />
                  </button>
                  <button className="icon-button danger" onClick={() => onRejectTodo(todo.id)} title="Neka" type="button">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}

            {pendingWishes.map((reward) => (
              <div className="approval-row" key={reward.id}>
                <div>
                  <strong>{reward.title}</strong>
                  <small>
                    <input
                      aria-label="Antal stjärnor"
                      className="stars-input"
                      max={100}
                      min={1}
                      onChange={(event) => onSetWishStars(reward.id, Number(event.target.value))}
                      type="number"
                      value={wishStars[reward.id] ?? reward.starsNeeded}
                    />
                    stjärnor · {getChildName(reward.wishedBy)}
                  </small>
                </div>
                <div className="approval-actions">
                  <button className="icon-button" onClick={() => onApproveWish(reward.id)} title="Godkänn önskning" type="button">
                    <CheckCircle2 size={16} />
                  </button>
                  <button className="icon-button danger" onClick={() => onRejectWish(reward.id)} title="Neka önskning" type="button">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
