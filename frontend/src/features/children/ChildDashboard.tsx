import { useEffect, useState } from "react";
import type { Calendar, Id, Member, PurchasedReward, Reward, Role, Todo, TimedTaskWithBest } from "@shared/types";

import { ChildTimeline } from "./ChildTimeline";
import { ChildHero } from "./ChildHero";
import { ChildWeekStrip } from "./ChildWeekStrip";
import { ChildTasksSection } from "./ChildTasksSection";
import { ChildRejectedTodos } from "./ChildRejectedTodos";
import { ChildTimedTasksSection } from "./ChildTimedTasksSection";
import { ChildStarsPanel } from "./ChildStarsPanel";
import { ChildPendingBadges } from "./ChildPendingBadges";
import { useChildCompleteHold } from "./useChildCompleteHold";
import { useChildStars } from "./useChildStars";
import { RewardShopModal } from "../rewards/RewardShopModal";
import { useRewardShopContext } from "../rewards/RewardShopContext";
import { rewardShopApi } from "../../api";
import { toLocalDateStr } from "../calendars/calendarHelpers";

import "./ChildDashboard.css";
import "./ChildResponsive.css";
import "./ChildStarsPanel.css";

type Props = {
  child: Member;
  calendars: Calendar[];
  roles: Role[];
  childRewards: Reward[];
  timelineTodos: Todo[];
  activeChildTodos: Todo[];
  rejectedTodos: Todo[];
  timedTasks: TimedTaskWithBest[];
  onRecordTimedAttempt: (id: Id, durationMs: number) => Promise<{ isNewRecord: boolean }>;
  wishTitle: string;
  onSetWishTitle: (title: string) => void;
  onCreateWish: (childId: Id, starsNeeded: number, title?: string) => void;
  onCompleteTodo: (todoId: Id) => void;
  onDismissRejectedTodo: (todoId: Id) => void;
  onThemePickerOpen: (memberId: Id) => void;
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
  childRewards,
  timelineTodos,
  activeChildTodos,
  rejectedTodos,
  timedTasks,
  onRecordTimedAttempt,
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
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [localSpentStars, setLocalSpentStars] = useState(() => child.spentStars ?? 0);

  const { requireApprovalForCategories, items: shopItems, purchaseVersion, onPurchaseReward } = useRewardShopContext();
  const { heldTodoId, startHold, clearHold } = useChildCompleteHold(
    activeChildTodos,
    onCompleteTodo
  );
  const { approvedStarsToday, totalApprovedStars, availableStars, pendingApprovalTodos } =
    useChildStars(child, timelineTodos, timerNow, localSpentStars);

  useEffect(() => {
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [dayPurchased, setDayPurchased] = useState<PurchasedReward[]>([]);
  const selectedDayStr = toLocalDateStr(selectedDay);

  useEffect(() => {
    let cancelled = false;
    rewardShopApi.getPurchasedByDate(selectedDayStr).then((all) => {
      if (!cancelled) setDayPurchased(all.filter((pr) => pr.memberId === child.id));
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [selectedDayStr, child.id, purchaseVersion]);

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
            purchased={dayPurchased}
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

          <ChildTimedTasksSection
            timedTasks={timedTasks}
            timerNow={timerNow}
            onRecordAttempt={onRecordTimedAttempt}
          />

          <div className="child-stars-anchor">
            <ChildPendingBadges todos={pendingApprovalTodos} />
            <ChildStarsPanel
              childId={child.id}
              approvedStarsToday={approvedStarsToday}
              totalApprovedStars={availableStars}
              onOpenShop={() => setIsShopOpen(true)}
              onThemePickerOpen={() => onThemePickerOpen(child.id)}
              onCreateWish={onCreateWish}
            />
          </div>

        </div>
      </div>

      {isShopOpen && (
        <RewardShopModal
          childId={child.id}
          items={shopItems}
          todos={timelineTodos}
          availableStars={availableStars}
          onPurchase={(item) => {
            setLocalSpentStars((s) => s + item.starCost);
            void onPurchaseReward(item, child.id);
          }}
          onClose={() => setIsShopOpen(false)}
        />
      )}
    </article>
  );
}
