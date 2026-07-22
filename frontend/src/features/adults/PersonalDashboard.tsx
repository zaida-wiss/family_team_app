import type { Calendar, Id, Member, Role, Todo, TodoCategory } from "@shared/types";

import { ChildTimeline } from "../children/ChildTimeline";
import { ChildHero } from "../children/ChildHero";
import { ChildWeekStrip } from "../children/ChildWeekStrip";
import { ChildTasksSection } from "../children/ChildTasksSection";
import { ChildRejectedTodos } from "../children/ChildRejectedTodos";
import { useChildCompleteHold } from "../children/useChildCompleteHold";
import { useState, useEffect } from "react";

import "../children/ChildDashboard.css";
import "../children/ChildResponsive.css";

// En vuxens egen uppgifter+kalender-vy (2026-07-22, Zaidas önskemål: "jag
// vill kunna se mina uppgifter och kalendrar på samma sätt som barnen gör
// när jag trycker på min profilbild") — visas när en vuxen väljer SIG
// SJÄLV i medlemsväljaren (inte en annan vuxen, som fortsatt visar den
// vanliga HomePage/"hemvy för den personen"). Återanvänder samma
// underkomponenter/interaktionsmönster som ChildDashboard.tsx (timeline,
// veckoremsa, håll-in-för-att-klarmarkera) — bara utan stjärnor/
// belöningsbutik/önskningar, som inte gäller för en vuxens egna uppgifter.
// Samma .child-dashboard-layoutklasser återanvänds (grid/flex, inte
// temafärger) med MEDLEMMENS EGET tema istället för barnens "space".
type Props = {
  member: Member;
  calendars: Calendar[];
  roles: Role[];
  categories: TodoCategory[];
  timelineTodos: Todo[];
  activeTodos: Todo[];
  rejectedTodos: Todo[];
  onCompleteTodo: (todoId: Id, elapsedMs?: number | null) => void;
  onDismissRejectedTodo: (todoId: Id) => void;
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

export function PersonalDashboard({
  member,
  calendars,
  roles,
  categories,
  timelineTodos,
  activeTodos,
  rejectedTodos,
  onCompleteTodo,
  onDismissRejectedTodo
}: Props) {
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const { heldTodoId, startHold, clearHold } = useChildCompleteHold(activeTodos, onCompleteTodo);

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
    <article className={`child-dashboard theme-${member.dashboardTheme ?? "clear"}`}>
      <div className="child-dashboard-body">
        <div className="child-dashboard-left">
          <ChildTimeline
            calendars={calendars}
            child={member}
            roles={roles}
            selectedDay={selectedDay}
            todos={timelineTodos}
            purchased={[]}
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

          <ChildHero
            childName={member.name}
            avatarUrl={member.avatarUrl}
            today={today}
          />

          <ChildTasksSection
            todos={activeTodos}
            categories={categories}
            today={today}
            timerNow={timerNow}
            heldTodoId={heldTodoId}
            onStartHold={startHold}
            onClearHold={clearHold}
            onCompleteTodo={onCompleteTodo}
          />

          <ChildRejectedTodos
            rejectedTodos={rejectedTodos}
            onDismiss={onDismissRejectedTodo}
          />
        </div>
      </div>
    </article>
  );
}
