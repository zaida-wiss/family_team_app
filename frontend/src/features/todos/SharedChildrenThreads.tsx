import "./ParentTodoThreadView.css";
import { useState } from "react";
import { Info, Lock } from "lucide-react";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { useSharedChildrenTodos } from "./useChildSharesState";
import type { Id } from "@shared/types";

const HOLD_DURATION_MS = 2000;

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22) — en tråd PER barn som delats MED mig (av en förälder i ett
// annat, eller samma, konto). Medvetet en egen, enklare komponent istället
// för att byggas in i ParentTodoThreadView.tsx (redan 1000+ rader, delmoment/
// filter/drag-and-drop/kategorimeny hör inte hemma här — ett delat barns
// todos har varken egna kategorier eller delmoments-checklista i denna första
// version, se ADR-0024:s Uppföljning). Återanvänder samma .todo-thread__*-
// klasser för visuell konsekvens, bara håll-in-bekräftelsen (samma mönster
// som resten av tråd-vyn) är egen kod eftersom completeSharedTodo tar en
// annan signatur (childAccountId+childMemberId, inte bara todoId).
//
// Utökad 2026-07-27 (Zaidas önskemål: "åtkomst till allt som är kopplat
// till barnets konto") med kalender/belöningar/Medaljer — döljs bakom en
// egen info-knapp per barn (progressiv avslöjning, samma princip som
// ParentTodoThreadView.tsx:s egen instruktionspanel) istället för att alltid
// visas, eftersom todos är det man oftast faktiskt vill agera på. Rent
// läsbart i denna version, ingen mutation på kalender/belöningar/Medaljer
// härifrån — samma "godkännande/stjärnor sker bara i barnets eget konto"-
// princip som redan gäller för todos.
export function SharedChildrenThreads() {
  // approveSharedTodo/rejectSharedTodo (2026-07-29, Zaidas beslut: "full
  // åtkomst, som en riktig förälder") — en edit-mottagare kan nu även
  // godkänna (delar ut stjärnor i barnets EGET konto) och neka en uppgift i
  // status "done", inte bara markera "pending" klar.
  const { sharedChildren, completeSharedTodo, approveSharedTodo, rejectSharedTodo } = useSharedChildrenTodos();
  const { heldId, startHold, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);
  const [expandedChildId, setExpandedChildId] = useState<Id | null>(null);

  if (sharedChildren.length === 0) return null;

  return (
    <div className="todo-thread-view">
      {sharedChildren.map(({ child, access, todos, calendarEvents, purchasedRewards, stars, timedTasks }) => {
        const pending = todos.filter((t) => t.status === "pending");
        const awaitingApproval = todos.filter((t) => t.status === "done");
        const expanded = expandedChildId === child.id;
        return (
          <section className="todo-thread" aria-label={`Delad tråd: ${child.name}`} key={child.id}>
            <div className="todo-thread__header">
              <div className="shared-child-thread__header-row">
                <h3 className="todo-thread__category">
                  {child.name}
                  {access === "view" && (
                    <Lock aria-label="Endast visning" className="shared-child-thread__lock" size={14} />
                  )}
                </h3>
                <button
                  aria-expanded={expanded}
                  aria-label={`Mer om ${child.name} (kalender, belöningar, Medaljer)`}
                  className="icon-button shared-child-thread__info-btn"
                  onClick={() => setExpandedChildId(expanded ? null : child.id)}
                  type="button"
                >
                  <Info size={14} />
                </button>
              </div>
            </div>

            {expanded && (
              <div className="shared-child-thread__details">
                <p className="shared-child-thread__stars">⭐ {stars.approved - stars.spent} stjärnor</p>

                <p className="shared-child-thread__details-title">Kommande i kalendern</p>
                {calendarEvents.length === 0 ? (
                  <p className="todo-thread__empty">Inget inbokat den närmaste tiden.</p>
                ) : (
                  <ul className="shared-child-thread__details-list">
                    {calendarEvents.slice(0, 4).map((e) => (
                      <li key={e.id}>{formatEventDate(e.startsAt)} — {e.title}</li>
                    ))}
                  </ul>
                )}

                <p className="shared-child-thread__details-title">Köpta belöningar</p>
                {purchasedRewards.length === 0 ? (
                  <p className="todo-thread__empty">Inga köp än.</p>
                ) : (
                  <ul className="shared-child-thread__details-list">
                    {purchasedRewards.slice(0, 4).map((p) => (
                      <li key={p.id}>{p.itemTitle} ({p.starCost} ⭐)</li>
                    ))}
                  </ul>
                )}

                <p className="shared-child-thread__details-title">Medaljer/Rekord</p>
                {timedTasks.length === 0 ? (
                  <p className="todo-thread__empty">Inga tidtagna uppgifter än.</p>
                ) : (
                  <ul className="shared-child-thread__details-list">
                    {timedTasks.map((t) => (
                      <li key={t.id}>
                        {t.title}: {t.bestDurationMs !== null ? formatDuration(t.bestDurationMs) : "Inget rekord än"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {pending.length === 0 ? (
              <p className="todo-thread__empty">Allt avklarat här 🎉</p>
            ) : (
              <ul className="todo-thread__list">
                {pending.map((todo) => (
                  <li className="todo-thread__item" key={todo.id}>
                    <button
                      type="button"
                      className={
                        "todo-thread__ball todo-thread__ball--small" +
                        (heldId === todo.id ? " todo-thread__ball--holding" : "")
                      }
                      disabled={access !== "edit"}
                      onPointerDown={
                        access === "edit"
                          ? () => startHold(todo.id, () => completeSharedTodo(child.accountId, child.id, todo.id))
                          : undefined
                      }
                      onPointerUp={clearHold}
                      onPointerLeave={clearHold}
                      onPointerCancel={clearHold}
                      title={todo.title}
                      aria-label={
                        `${todo.title}, ${child.name}` +
                        (access === "edit" ? ". Håll intryckt i två sekunder för att markera klar." : ". Endast visning.")
                      }
                    >
                      {todo.visual.value && (
                        <span aria-hidden="true" className="todo-thread__ball-icon">
                          {todo.visual.value}
                        </span>
                      )}
                      <span className="todo-thread__ball-title">{todo.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {access === "edit" && awaitingApproval.length > 0 && (
              <div className="shared-child-thread__approval">
                <p className="shared-child-thread__details-title">Väntar på godkännande</p>
                <ul className="shared-child-thread__details-list">
                  {awaitingApproval.map((todo) => (
                    <li className="shared-child-thread__approval-row" key={todo.id}>
                      <span>{todo.title}</span>
                      <button
                        aria-label={`Godkänn ${todo.title} för ${child.name}`}
                        className="secondary-button"
                        onClick={() => approveSharedTodo(child.accountId, child.id, todo.id)}
                        type="button"
                      >
                        Godkänn
                      </button>
                      <button
                        aria-label={`Neka ${todo.title} för ${child.name}`}
                        className="icon-button danger"
                        onClick={() => rejectSharedTodo(child.accountId, child.id, todo.id, null)}
                        type="button"
                      >
                        Neka
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
