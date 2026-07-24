import { useMemo } from "react";
import { X } from "lucide-react";
import type { Member, Todo } from "@shared/types";

type Props = {
  todos: Todo[];
  members: Member[];
  onClose: () => void;
};

const DAYS = 7;

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

// Statistik-knapp (2026-07-25, Zaidas önskemål: "en knapp vid bubbelsysslorna
// för statistik över tid") — helt klientberäknad ur redan hämtad allTodos,
// ingen ny backend-aggregering. Avsiktligt smalt scope för en första version:
// antal godkända uppgifter per dag, senaste 7 dagarna, en rad per
// familjemedlem. Enkel-nyans sekventiell färgkodning (opacitet på
// --primary) — inte en kategorisk palett, så ingen valideringskörning
// behövs (dataviz-skillens palettvalidator gäller kategoriska paletter).
export function TodoStatsModal({ todos, members, onClose }: Props) {
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, []);

  const activeMembers = useMemo(() => members.filter((m) => m.deletedAt === null), [members]);

  const statsByMember = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const member of activeMembers) {
      map.set(member.id, days.map(() => 0));
    }
    for (const todo of todos) {
      if (todo.status !== "approved" || !todo.approvedAt || !todo.assignedTo) continue;
      const counts = map.get(todo.assignedTo);
      if (!counts) continue;
      const idx = days.indexOf(dayKey(todo.approvedAt));
      if (idx !== -1) counts[idx]++;
    }
    return map;
  }, [todos, activeMembers, days]);

  return (
    <div className="todo-thread-view__reuse-overlay" onClick={onClose}>
      <div
        aria-labelledby="todo-stats-title"
        aria-modal="true"
        className="todo-thread-view__reuse-modal todo-stats-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="todo-thread-view__info-header">
          <h3 id="todo-stats-title">Statistik — senaste 7 dagarna</h3>
          <button aria-label="Stäng" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        {activeMembers.length === 0 ? (
          <p className="empty-note">Inga familjemedlemmar än.</p>
        ) : (
          <ul className="todo-stats-list">
            {activeMembers.map((member) => {
              const counts = statsByMember.get(member.id) ?? days.map(() => 0);
              const total = counts.reduce((a, b) => a + b, 0);
              const max = Math.max(1, ...counts);
              return (
                <li className="todo-stats-row" key={member.id}>
                  <div className="todo-stats-row__header">
                    <span className="todo-stats-row__name">{member.name}</span>
                    <span className="todo-stats-row__total">{total} avklarade</span>
                  </div>
                  <div className="todo-stats-row__bars" role="img" aria-label={`${member.name}: ${total} avklarade uppgifter de senaste 7 dagarna`}>
                    {counts.map((count, i) => (
                      <span
                        className="todo-stats-row__bar"
                        key={days[i]}
                        style={{
                          "--bar-height": `${Math.max(6, Math.round((count / max) * 100))}%`,
                          "--bar-opacity": count === 0 ? 0.12 : 0.35 + (count / max) * 0.65
                        } as React.CSSProperties}
                        title={`${days[i]}: ${count}`}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
