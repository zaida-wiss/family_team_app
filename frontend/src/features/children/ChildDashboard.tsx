import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import type { Calendar, Id, Member, Reward, RewardPathProgress, Role, Todo } from "@shared/types";

import { ChildTimeline } from "./ChildTimeline";
import { ChildHero } from "./ChildHero";
import { ChildWeekStrip } from "./ChildWeekStrip";
import { ChildTasksSection } from "./ChildTasksSection";
import { ChildRejectedTodos } from "./ChildRejectedTodos";
import { ChildStarsPanel } from "./ChildStarsPanel";
import { ChildPendingBadges } from "./ChildPendingBadges";
import { ChildWishModal } from "./ChildWishModal";
import { useChildCompleteHold } from "./useChildCompleteHold";

import "./ChildDashboard.css";
import "./ChildResponsive.css";
import "./ChildStarsPanel.css";

type Props = {
  child: Member;
  calendars: Calendar[];
  roles: Role[];
  activeReward: Reward | null;
  rewardProgress: RewardPathProgress | null;
  childRewards: Reward[];
  timelineTodos: Todo[];
  activeChildTodos: Todo[];
  rejectedTodos: Todo[];
  wishTitle: string;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: Id, starsNeeded: number) => void;
  onCompleteTodo: (todoId: Id) => void;
  onDismissRejectedTodo: (todoId: Id) => void;
  onThemePickerOpen: (memberId: Id) => void;
};

function isSameLocalDay(isoStr: string | null, date: Date) {
  if (!isoStr) return false;
  const candidate = new Date(isoStr);
  return (
    candidate.getFullYear() === date.getFullYear() &&
    candidate.getMonth() === date.getMonth() &&
    candidate.getDate() === date.getDate()
  );
}

function getWeekStripDays(anchor: Date) {
  const monday = new Date(anchor);
  const dow = (anchor.getDay() + 6) % 7;
  monday.setDate(anchor.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function ChildDashboard({
  child,
  calendars,
  roles,
  activeReward,
  rewardProgress,
  childRewards,
  timelineTodos,
  activeChildTodos,
  rejectedTodos,
  wishTitle,
  onSetWishTitle,
  onCreateWish,
  onCompleteTodo,
  onDismissRejectedTodo,
  onThemePickerOpen,
}: Props) {
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [isWishModalOpen, setIsWishModalOpen] = useState(false);

  const { heldTodoId, completedCue, startHold, clearHold } = useChildCompleteHold(
    activeChildTodos,
    onCompleteTodo
  );

  useEffect(() => {
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const taskGroups = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const todo of activeChildTodos) {
      const cat = todo.routineCategory ?? "";
      const bucket = map.get(cat) ?? [];
      bucket.push(todo);
      map.set(cat, bucket);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (!a && b ? 1 : a && !b ? -1 : a.localeCompare(b, "sv")))
      .map(([category, todos]) => ({ category, todos }));
  }, [activeChildTodos]);

  const today = new Date(timerNow);
  const weekStripDays = getWeekStripDays(selectedDay);

  const approvedStarsToday = timelineTodos
    .filter(
      (t) =>
        t.assignedTo === child.id &&
        t.status === "approved" &&
        t.deletedAt === null &&
        isSameLocalDay(t.approvedAt ?? t.completedAt, today)
    )
    .reduce((sum, t) => sum + t.starValue, 0);

  const totalApprovedStars = timelineTodos
    .filter((t) => t.assignedTo === child.id && t.status === "approved" && t.deletedAt === null)
    .reduce((sum, t) => sum + t.starValue, 0);

  const pendingApprovalTodos = timelineTodos
    .filter((t) => t.assignedTo === child.id && t.status === "done" && t.deletedAt === null)
    .sort((a, b) => {
      const tA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tB - tA;
    })
    .slice(0, 8);

  function moveWeek(direction: -1 | 1) {
    setSelectedDay((cur) => {
      const next = new Date(cur);
      next.setDate(cur.getDate() + direction * 7);
      next.setHours(0, 0, 0, 0);
      return next;
    });
  }

  return (
    <article className={`child-dashboard theme-${child.dashboardTheme ?? "space"}`}>
      <div className="child-dashboard-body">
        <div className="child-dashboard-left">
          <ChildTimeline
            calendars={calendars}
            child={child}
            roles={roles}
            selectedDay={selectedDay}
            todos={timelineTodos}
          />
        </div>

        <div className="child-dashboard-main">
          <ChildWeekStrip
            days={weekStripDays}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onPrevWeek={() => moveWeek(-1)}
            onNextWeek={() => moveWeek(1)}
          />

          <ChildHero childName={child.name} avatarUrl={child.avatarUrl} today={today} />

          <ChildTasksSection
            taskGroups={taskGroups}
            today={today}
            timerNow={timerNow}
            heldTodoId={heldTodoId}
            onStartHold={startHold}
            onClearHold={clearHold}
          />

          <ChildRejectedTodos
            rejectedTodos={rejectedTodos}
            onDismiss={onDismissRejectedTodo}
          />

          <div className="child-stars-anchor">
            <ChildPendingBadges todos={pendingApprovalTodos} />
            <ChildStarsPanel
              approvedStarsToday={approvedStarsToday}
              totalApprovedStars={totalApprovedStars}
              activeReward={activeReward}
              rewardProgress={rewardProgress}
              onOpenShop={() => setIsWishModalOpen(true)}
              onThemePickerOpen={() => onThemePickerOpen(child.id)}
            />
          </div>

          {completedCue && (
            <div className="child-complete-cue" role="status" aria-live="polite">
              <div className="child-complete-cue-icon">
                <span>{completedCue.visual}</span>
              </div>
              <div>
                <strong>{completedCue.title}</strong>
                <small>Flyttad till väntar på godkännande</small>
              </div>
              <span className="child-complete-cue-stars">
                +{completedCue.starValue} <Star size={12} fill="currentColor" />
              </span>
            </div>
          )}
        </div>
      </div>

      {isWishModalOpen && (
        <ChildWishModal
          childId={child.id}
          approvedStarsTotal={totalApprovedStars}
          childRewards={childRewards}
          nowMs={timerNow}
          wishTitle={wishTitle}
          onSetWishTitle={onSetWishTitle}
          onCreateWish={onCreateWish}
          onClose={() => setIsWishModalOpen(false)}
        />
      )}
    </article>
  );
}
