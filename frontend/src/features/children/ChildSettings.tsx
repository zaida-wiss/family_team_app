import "./ChildSettings.css";
import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Pencil, Save, Star, X, XCircle } from "lucide-react";
import { ChildRoutineCreator } from "./ChildRoutineCreator";
import { EmojiPickerPortal } from "../../components/EmojiPickerPortal";
import { hasPermission } from "../../utils/permissions";
import type { ChildTimelineSettings, Id, Member, Reward, Role, Todo } from "@shared/types";

type Props = {
  currentMember: Member;
  members: Member[];
  roles: Role[];
  todos: Todo[];
  rewards: Reward[];
  onCreateWish: (childId: Id, starsNeeded: number, title: string) => void;
  onApproveTodo: (todoId: Id) => void;
  onRejectTodo: (todoId: Id, reason: string | null) => void;
  onApproveWish: (rewardId: Id) => void;
  onRejectWish: (rewardId: Id) => void;
  onUpdateWish: (rewardId: Id, patch: { title?: string; starsNeeded?: number; symbol?: string | null }) => void;
  onCreateTodo: (todo: Todo) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onUpdateChildTimelineSettings: (memberId: Id, settings: ChildTimelineSettings) => void;
  onRefreshRoutine: (routineId: Id) => void;
  onDeleteTodo: (todoId: Id) => void;
};

const DEFAULT_CHILD_TIMELINE_SETTINGS: ChildTimelineSettings = {
  startsAt: "06:00",
  endsAt: "21:00",
};

export function ChildSettings({
  currentMember,
  members,
  roles,
  todos,
  rewards,
  onCreateWish,
  onApproveTodo,
  onRejectTodo,
  onApproveWish,
  onRejectWish,
  onUpdateWish,
  onCreateTodo,
  onUpdateTodo,
  onUpdateChildTimelineSettings,
  onRefreshRoutine,
  onDeleteTodo,
}: Props) {
  const [wishChildId, setWishChildId] = useState("");
  const [timelineChildId, setTimelineChildId] = useState("");
  const [wishTitle, setWishTitle] = useState("");
  const [wishStarsNeeded, setWishStarsNeeded] = useState(10);
  const [editingWishId, setEditingWishId] = useState<Id | null>(null);
  const [editWishTitle, setEditWishTitle] = useState("");
  const [editWishStars, setEditWishStars] = useState(10);
  const [editWishSymbol, setEditWishSymbol] = useState("");
  const [rejectingTodoId, setRejectingTodoId] = useState<Id | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  function startRejecting(todoId: Id) {
    setRejectingTodoId(todoId);
    setRejectionReason("");
  }

  function cancelRejecting() {
    setRejectingTodoId(null);
    setRejectionReason("");
  }

  function confirmRejecting(todoId: Id) {
    onRejectTodo(todoId, rejectionReason.trim() || null);
    setRejectingTodoId(null);
    setRejectionReason("");
  }

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

  const pendingWishes = rewards.filter(
    (reward) =>
      childIds.has(reward.wishedBy) &&
      reward.deletedAt === null &&
      reward.status === "suggested"
  );
  const pendingTodos = todos.filter(
    (todo) =>
      childIds.has(todo.assignedTo ?? "") &&
      todo.status === "done" &&
      todo.deletedAt === null
  );

  function getChildName(memberId: Id) {
    return childById.get(memberId)?.name ?? "Barn";
  }

  const selectedWishChildId = wishChildId || childMembers[0]?.id || "";
  const selectedTimelineChild = childById.get(timelineChildId || childMembers[0]?.id || "");
  const selectedTimelineSettings =
    selectedTimelineChild?.childTimelineSettings ?? DEFAULT_CHILD_TIMELINE_SETTINGS;
  const timelineHasValidRange = selectedTimelineSettings.startsAt < selectedTimelineSettings.endsAt;

  function updateTimelineSetting(patch: Partial<ChildTimelineSettings>) {
    if (!selectedTimelineChild) return;
    const nextSettings = {
      ...DEFAULT_CHILD_TIMELINE_SETTINGS,
      ...(selectedTimelineChild.childTimelineSettings ?? {}),
      ...patch,
    };
    onUpdateChildTimelineSettings(selectedTimelineChild.id, nextSettings);
  }

  function submitWish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWishChildId || !wishTitle.trim()) return;
    onCreateWish(selectedWishChildId, wishStarsNeeded, wishTitle);
    setWishTitle("");
    setWishStarsNeeded(10);
  }

  function startEditWish(reward: Reward) {
    setEditingWishId(reward.id);
    setEditWishTitle(reward.title);
    setEditWishStars(reward.starsNeeded);
    setEditWishSymbol(reward.symbol ?? "");
  }

  function saveEditWish(rewardId: Id) {
    if (!editWishTitle.trim()) return;
    onUpdateWish(rewardId, {
      title: editWishTitle.trim(),
      starsNeeded: editWishStars,
      symbol: editWishSymbol || null,
    });
    setEditingWishId(null);
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
        <form className="wish-form" onSubmit={submitWish}>
          {childMembers.length > 1 && (
            <select
              aria-label="Barn"
              className="wish-form-input"
              onChange={(event) => setWishChildId(event.target.value)}
              value={selectedWishChildId}
            >
              {childMembers.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </select>
          )}
          <input
            aria-label="Ny önskning"
            className="wish-form-input"
            onChange={(event) => setWishTitle(event.target.value)}
            placeholder="Ny önskning"
            type="text"
            value={wishTitle}
          />
          <input
            aria-label="Antal stjärnor"
            className="wish-form-stars"
            max={999}
            min={1}
            onChange={(event) => setWishStarsNeeded(Math.max(1, parseInt(event.target.value, 10) || 1))}
            type="number"
            value={wishStarsNeeded}
          />
          <button className="wish-form-btn" type="submit">Lägg till</button>
        </form>
        {pendingWishes.length === 0 ? (
          <p className="settings-sub-desc">Inga önskningar väntar på godkännande.</p>
        ) : (
          <section className="approval-panel child-settings-panel" aria-label="Barnens önskningar">
            {pendingWishes.map((reward) =>
              editingWishId === reward.id ? (
                <div className="approval-row child-settings-row child-settings-row--editing" key={reward.id}>
                  <EmojiPickerPortal
                    symbol={editWishSymbol}
                    onSelect={setEditWishSymbol}
                    triggerClassName="reward-shop-settings__emoji-btn reward-shop-settings__emoji-btn--sm"
                  />
                  <input
                    aria-label="Önskningsnamn"
                    className="wish-edit-input"
                    onChange={(e) => setEditWishTitle(e.target.value)}
                    type="text"
                    value={editWishTitle}
                  />
                  <input
                    aria-label="Antal stjärnor"
                    className="wish-edit-stars"
                    max={999}
                    min={1}
                    onChange={(e) => setEditWishStars(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    type="number"
                    value={editWishStars}
                  />
                  <div className="approval-actions">
                    <button aria-label="Spara" className="icon-button" onClick={() => saveEditWish(reward.id)} type="button">
                      <Save size={16} />
                    </button>
                    <button aria-label="Avbryt" className="icon-button" onClick={() => setEditingWishId(null)} type="button">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="approval-row child-settings-row" key={reward.id}>
                  <div>
                    {reward.symbol && <span className="wish-symbol">{reward.symbol}</span>}
                    <strong>{reward.title}</strong>
                    <small>{getChildName(reward.wishedBy)} · {reward.starsNeeded} stjärnor</small>
                  </div>
                  <div className="approval-actions">
                    <button aria-label="Redigera önskning" className="icon-button" onClick={() => startEditWish(reward)} type="button">
                      <Pencil size={16} />
                    </button>
                    {canApprove && (
                      <>
                        <button aria-label="Godkänn önskning" className="icon-button" onClick={() => onApproveWish(reward.id)} title="Godkänn — läggs till i butiken" type="button">
                          <CheckCircle2 size={16} />
                        </button>
                        <button aria-label="Avvisa önskning" className="icon-button danger" onClick={() => onRejectWish(reward.id)} type="button">
                          <XCircle size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            )}
          </section>
        )}
      </div>

      <div className="settings-sub">
        <h3 className="settings-sub-title">Tidslinje</h3>
        <div className="child-timeline-settings">
          {childMembers.length > 1 && (
            <label>
              <span>Barn</span>
              <select
                onChange={(event) => setTimelineChildId(event.target.value)}
                value={selectedTimelineChild?.id ?? ""}
              >
                {childMembers.map((child) => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>Start</span>
            <input
              type="time"
              value={selectedTimelineSettings.startsAt}
              onChange={(event) => updateTimelineSetting({ startsAt: event.target.value })}
            />
          </label>
          <label>
            <span>Slut</span>
            <input
              type="time"
              value={selectedTimelineSettings.endsAt}
              onChange={(event) => updateTimelineSetting({ endsAt: event.target.value })}
            />
          </label>
        </div>
        {!timelineHasValidRange && (
          <p className="settings-sub-desc">Sluttiden behöver vara senare än starttiden.</p>
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
        ) : pendingTodos.length === 0 ? (
          <p className="settings-sub-desc">Inga uppgifter väntar på godkännande.</p>
        ) : (
          <section className="approval-panel child-settings-panel" aria-label="Barnens godkännanden">
            <div className="approval-header">
              <strong>Väntar</strong>
              <span>{pendingTodos.length}</span>
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
                {rejectingTodoId === todo.id ? (
                  <div className="approval-reject-form">
                    <input
                      autoFocus
                      className="text-input"
                      onChange={(e) => setRejectionReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRejecting(todo.id);
                        if (e.key === "Escape") cancelRejecting();
                      }}
                      placeholder="Varför? (valfritt)"
                      value={rejectionReason}
                    />
                    <button className="icon-button danger" onClick={() => confirmRejecting(todo.id)} title="Skicka" type="button">
                      <XCircle size={16} />
                    </button>
                    <button className="icon-button" onClick={cancelRejecting} title="Avbryt" type="button">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="approval-actions">
                    <button className="icon-button" onClick={() => onApproveTodo(todo.id)} title="Godkänn" type="button">
                      <CheckCircle2 size={16} />
                    </button>
                    <button className="icon-button danger" onClick={() => startRejecting(todo.id)} title="Neka" type="button">
                      <XCircle size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
