import { useEffect, useState } from "react";
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
import { useChildStars } from "./useChildStars";
import { useRewardShopState } from "../rewards/useRewardShopState";
import { RewardShopModal } from "../rewards/RewardShopModal";

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
  onLogout: () => Promise<void>;
};

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
  onLogout,
}: Props) {
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [isWishModalOpen, setIsWishModalOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [localSpentStars, setLocalSpentStars] = useState(() => child.spentStars ?? 0);

  const { items: shopItems, purchased, purchase } = useRewardShopState();
  const { heldTodoId, completedCue, startHold, clearHold } = useChildCompleteHold(
    activeChildTodos,
    onCompleteTodo
  );
  const { approvedStarsToday, totalApprovedStars, availableStars, pendingApprovalTodos } =
    useChildStars(child.id, timelineTodos, timerNow, localSpentStars);

  useEffect(() => {
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const today = new Date(timerNow);
  const weekStripDays = getWeekStripDays(selectedDay);

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
            purchased={purchased.filter((pr) => pr.memberId === child.id)}
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

          <ChildHero childName={child.name} avatarUrl={child.avatarUrl} today={today} onLogout={onLogout} />

          <ChildTasksSection
            todos={activeChildTodos}
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
              totalApprovedStars={availableStars}
              activeReward={activeReward}
              rewardProgress={rewardProgress}
              onOpenShop={() => setIsShopOpen(true)}
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

      {isShopOpen && (
        <RewardShopModal
          items={shopItems}
          availableStars={availableStars}
          purchased={purchased}
          onPurchase={(item) => {
            setLocalSpentStars((s) => s + item.starCost);
            void purchase(item, child.id);
          }}
          onClose={() => setIsShopOpen(false)}
        />
      )}

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
