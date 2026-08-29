import type { Calendar, Id, Member, Role, Todo, TodoCategory } from "@shared/types";
import type { AssignedSubtaskCard } from "../todos/selectors";
import { Trophy } from "lucide-react";

import { ChildTimeline } from "../children/ChildTimeline";
import { ChildHero } from "../children/ChildHero";
import { ChildWeekStrip } from "../children/ChildWeekStrip";
import { ChildTasksSection } from "../children/ChildTasksSection";
import { ChildRejectedTodos } from "../children/ChildRejectedTodos";
import { useChildCompleteHold } from "../children/useChildCompleteHold";
import { useState, useEffect } from "react";

import "../children/ChildDashboard.css";
import "../children/ChildResponsive.css";
import "../children/ChildStarsPanel.css";
import "./PersonalDashboard.css";

// En vuxen medlems uppgifter+kalender-vy (2026-07-22, Zaidas önskemål: "jag
// vill kunna se mina uppgifter och kalendrar på samma sätt som barnen gör
// när jag trycker på min profilbild") — visas när VILKEN vuxen som helst
// väljs i medlemsväljaren, inte bara vid självval (2026-07-27, Zaidas fynd:
// "får alla vuxna även en barnvy? Nu står Lars som förälder och han får
// ingen barnvy" — reverserar 2026-07-22-beslutets uttryckliga undantag för
// "en vuxen som väljer en ANNAN vuxen"). Komponenten själv har aldrig antagit
// att `member` är den inloggade — `member` är helt enkelt VALD medlem, redan
// generisk. Återanvänder samma underkomponenter/interaktionsmönster som
// ChildDashboard.tsx (timeline, veckoremsa, håll-in-för-att-klarmarkera) —
// bara utan stjärnor/belöningsbutik/önskningar, som inte gäller för en
// vuxens egna uppgifter. Samma .child-dashboard-layoutklasser återanvänds
// (grid/flex, inte temafärger) med MEDLEMMENS EGET tema istället för
// barnens "space".
type Props = {
  member: Member;
  calendars: Calendar[];
  roles: Role[];
  categories: TodoCategory[];
  timelineTodos: Todo[];
  activeTodos: Todo[];
  rejectedTodos: Todo[];
  // Delmoment tilldelade denna vuxna, mixade in bland de vanliga
  // uppdragskorten (2026-08-12), se ChildTasksSection.tsx.
  subtaskCards: AssignedSubtaskCard[];
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onCompleteTodo: (todoId: Id, elapsedMs?: number | null) => void;
  onDismissRejectedTodo: (todoId: Id) => void;
  // Rekord-sidan (2026-08-08, Zaidas önskemål: en öppen tidtagnings resultat
  // skickas till Medaljer/Rekord — "där ska jag kunna se mina tidtagningar
  // över tid") — PersonalDashboard saknar ChildStarsPanel (stjärnor/
  // belöningar gäller inte en vuxens egna uppgifter), så pokal-knappen ligger
  // istället som en egen, liten knapp här.
  onOpenRecords: () => void;
  // Redigera-knapp på uppdragskortet (2026-08-10) — vidarebefordras rakt av
  // till ChildTasksSection.tsx (samma opt-in-princip: satt bara av den
  // som äger anropsstället i MemberShellContent.tsx, bara vid SJÄLVVAL).
  onEditTodo?: (todo: Todo) => void;
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
  subtaskCards,
  onToggleSubtask,
  onCompleteTodo,
  onDismissRejectedTodo,
  onOpenRecords,
  onEditTodo
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

          <div className="personal-dashboard__hero-row">
            <ChildHero
              childName={member.name}
              avatarUrl={member.avatarUrl}
              today={today}
            />
            {/* data-swipe-ignore (2026-08-30, hittat under verifiering av en
                helt annan kontrastbugg) — knappen ligger fast top:0;right:0,
                i praktiken alltid innanför useMemberSwipeNav.ts:s
                DESKTOP_MARGIN_PX (48px, mus-varianten av svepnavigeringen).
                Ett musklick där startar setPointerCapture() på wrapper-diven
                innan uppklicket hinner nå knappen — click-eventet sväljs
                tyst, knappen gick inte att trycka på med mus på desktop.
                Samma redan etablerade opt-out som belöningsbutikens
                plånbokssedlar/kortpengar (2026-08-29) löser det, se
                isSwipeIgnored i useMemberSwipeNav.ts. */}
            <button
              aria-label="Rekord"
              className="child-theme-button child-records-button personal-dashboard__records-btn"
              data-swipe-ignore
              onClick={onOpenRecords}
              title="Rekord"
              type="button"
            >
              <Trophy size={18} />
            </button>
          </div>

          <ChildTasksSection
            todos={activeTodos}
            categories={categories}
            today={today}
            timerNow={timerNow}
            heldTodoId={heldTodoId}
            onStartHold={startHold}
            onClearHold={clearHold}
            onCompleteTodo={onCompleteTodo}
            onEditTodo={onEditTodo}
            subtaskCards={subtaskCards}
            onToggleSubtask={onToggleSubtask}
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
