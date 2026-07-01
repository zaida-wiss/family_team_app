import { useState } from "react";
import { ChevronDown, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { fmtTime } from "../calendars/calendarHelpers";
import { MemberAvatar } from "../../components/MemberAvatar";
import { WEEKDAYS, getRoutineDays, type RoutineGroup } from "./routineHelpers";

type Props = {
  routineGroups: RoutineGroup[];
  onEdit: (group: RoutineGroup) => void;
  onRefresh: (group: RoutineGroup) => void;
  onDelete: (group: RoutineGroup) => void;
};

export function RoutineList({ routineGroups, onEdit, onRefresh, onDelete }: Props) {
  const [open, setOpen] = useState(false);

  if (routineGroups.length === 0) return null;

  return (
    <div className="rcr-list">
      <button
        className="rcr-list-toggle"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>Inlagda rutiner</span>
        <small>{routineGroups.length}</small>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="rcr-list-menu">
          <table className="rcr-list-table" aria-label="Inlagda rutiner">
            <colgroup>
              <col className="rcr-list-col-icon" />
              <col className="rcr-list-col-time" />
              <col className="rcr-list-col-title" />
              <col className="rcr-list-col-days" />
              <col className="rcr-list-col-children" />
              <col className="rcr-list-col-value" />
              <col className="rcr-list-col-action" />
              <col className="rcr-list-col-refresh" />
              <col className="rcr-list-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Ikon</th>
                <th scope="col">Tid</th>
                <th scope="col">Titel</th>
                <th scope="col">Veckodagar</th>
                <th scope="col">Barn</th>
                <th scope="col">Värde</th>
                <th scope="col">Ändra</th>
                <th scope="col">Refrecha</th>
                <th scope="col">Deleta</th>
              </tr>
            </thead>
            <tbody>
              {routineGroups.map((group) => {
                const t = group.todos[0];
                return (
                  <tr key={group.key}>
                    <td className="rcr-list-icon">{t.visual.value}</td>
                    <td className="rcr-list-time">
                      {t.visibleFrom ? (
                        <>
                          {fmtTime(t.visibleFrom)}
                          {t.expiresAt ? (
                            <span className="rcr-list-time-end">–{fmtTime(t.expiresAt)}</span>
                          ) : null}
                        </>
                      ) : "--:--"}
                    </td>
                    <td className="rcr-list-name">
                      <span>{t.title}</span>
                    </td>
                    <td className="rcr-list-days" aria-label="Veckodagar">
                      {WEEKDAYS.map(({ key, short }) => {
                        const isActive = getRoutineDays(t).includes(key);
                        return (
                          <span
                            key={key}
                            className={`rcr-list-day${isActive ? " rcr-list-day--on" : ""}`}
                            aria-label={isActive ? `${short} har rutinen` : `${short} har inte rutinen`}
                            title={isActive ? "Rutin denna dag" : "Ingen rutin denna dag"}
                          >
                            {short}
                          </span>
                        );
                      })}
                    </td>
                    <td className="rcr-list-children">
                      <span className="rcr-list-child-icons">
                        {group.children.map((child) => (
                          <MemberAvatar key={child.id} member={child} size="xs" />
                        ))}
                      </span>
                    </td>
                    <td className="rcr-list-stars">{t.starValue}★</td>
                    <td className="rcr-list-action-cell">
                      <button
                        className="rcr-list-action"
                        type="button"
                        onClick={() => onEdit(group)}
                        aria-label={`Redigera ${t.title}`}
                      >
                        <Pencil size={8} />
                      </button>
                    </td>
                    <td className="rcr-list-action-cell">
                      <button
                        className="rcr-list-action"
                        type="button"
                        onClick={() => onRefresh(group)}
                        aria-label={`Visa ${t.title} igen idag`}
                      >
                        <RefreshCw size={8} />
                      </button>
                    </td>
                    <td className="rcr-list-action-cell">
                      <button
                        className="rcr-list-action"
                        type="button"
                        onClick={() => onDelete(group)}
                        aria-label={`Ta bort ${t.title}`}
                      >
                        <Trash2 size={8} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
