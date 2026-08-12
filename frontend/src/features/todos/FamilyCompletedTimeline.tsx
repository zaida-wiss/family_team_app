import type { Member, Todo } from "@shared/types";
import { fmtTime } from "../calendars/calendarHelpers";
import { DEFAULT_TIMELINE_RANGE, fmtHourLabel, pinPositionsHorizontal } from "../children/timelineMath";
import { getFamilyCompletedTimelineItems } from "./selectors";
import "./FamilyCompletedTimeline.css";

type Props = {
  todos: Todo[];
  members: Member[];
};

const HOUR_MARKS = [6, 9, 12, 15, 18, 21].map((h) => h * 60);

// Hela familjens gemensamt avklarade dag, som ikoner på en vågrät tidslinje
// (2026-08-12, Zaida: "hela familjens samlade avklarade todos, även
// deluppgifter, i en container fylld av dessa ikoner... som den lodräta i
// dashboard men vågrät"). Samma "avklarat"-definition som den lodräta
// per-persons ChildTimeline.tsx (status done ELLER approved, inte bara
// godkänt) — se getFamilyCompletedTimelineItems (todos/selectors.ts).
export function FamilyCompletedTimeline({ todos, members }: Props) {
  const items = getFamilyCompletedTimelineItems(todos, new Date());
  const positions = pinPositionsHorizontal(
    items.map((item) => ({ id: item.id, isoTime: item.completedAt })),
    DEFAULT_TIMELINE_RANGE
  );

  return (
    <section aria-label="Familjens avklarade idag" className="family-completed-timeline">
      <h3 className="family-completed-timeline__heading">Idag i familjen</h3>
      {items.length === 0 ? (
        <p className="empty-note">Inget avklarat än idag.</p>
      ) : (
        <div className="family-completed-timeline__scroll">
          <div className="family-completed-timeline__track">
            {HOUR_MARKS.map((minute, i) => {
              const pct = ((minute - DEFAULT_TIMELINE_RANGE.startMinute) / (DEFAULT_TIMELINE_RANGE.endMinute - DEFAULT_TIMELINE_RANGE.startMinute)) * 100;
              // Ändpunkterna (06/21) centreras INTE (translateX(-50%) hade
              // klippt hälften av siffran utanför tidslinjens egen bredd,
              // ingen extra scrollbar yta finns att visa den resterande
              // halvan i) — vänsterankrad vid start, högerankrad vid slut.
              const isFirst = i === 0;
              const isLast = i === HOUR_MARKS.length - 1;
              return (
                <span
                  className="family-completed-timeline__hour"
                  key={minute}
                  style={{ left: `${pct}%`, transform: isFirst ? "none" : isLast ? "translateX(-100%)" : "translateX(-50%)" }}
                >
                  {fmtHourLabel(minute)}
                </span>
              );
            })}
            {items.map((item) => {
              const pos = positions.get(item.id);
              if (!pos) return null;
              const assignee = members.find((m) => m.id === item.assigneeId);
              return (
                <div
                  className="family-completed-timeline__icon"
                  key={item.id}
                  style={{
                    left: pos.left,
                    top: pos.top,
                    ...(assignee?.color ? { "--icon-accent": assignee.color } : {})
                  }}
                  title={`${item.title} — ${assignee?.name ?? "Familjen"}, ${fmtTime(item.completedAt)}`}
                >
                  <span aria-hidden="true">{item.emoji ?? "✅"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
