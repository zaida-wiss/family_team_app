import "./ParentTodoThreadView.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Id, Member, Todo, TodoThreadRange } from "@shared/types";
import { TodoDetailView } from "./TodoDetailView";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";
import { isDueWithinRange, isTodoVisibleNow } from "./selectors";
import {
  applyBubbleOrder,
  assigneeColorFor,
  assigneeNameFor,
  computeProgress,
  formatElapsed,
  sortByEndThenStartTime,
  stableBubbleKey
} from "./ParentTodoThreadView";

const HOLD_DURATION_MS = 2000;
const DISSOLVE_DURATION_MS = 500;
const DOUBLE_TAP_MS = 300;
const DRAG_THRESHOLD_PX = 8;

// Hem-vyns familjetrådar (2026-08-01, Zaidas önskemål: "hemvyn skall vara
// återanvändbara moduler med samma logik som i navbarens vyer... man skall
// signa upp sig på en uppgift på samma sätt som i todovyn med bollar i
// trådar. två tryck för att tilldela, tre tryck för att flytta") — samma
// bubbel-gester som ParentTodoThreadView.tsx (kort tryck öppnar visa-vyn,
// dubbeltryck öppnar "vem håller på med den här", håll 2s markerar klar,
// tre snabba tryck på trådens rubrik växlar flyttläge för att dra om
// bubblornas ordning), återanvänder samma exporterade hjälpfunktioner och
// CSS-klasser istället för att duplicera dem. En egen, enklare komponent
// (inte ParentTodoThreadView självt) eftersom varje tråd här kan höra till
// ETT ANNAT KONTO — mutationerna skickas in redan hopkopplade per tråd
// (onComplete/onToggleInProgress/onToggleSubtask/onCreateTodo), komponenten
// själv behöver aldrig veta vilket konto en tråd hör till.
export type FamilyThreadSource = {
  id: Id;
  // Vilket konto tråden hör till (2026-08-01) — komponenten själv bryr sig
  // aldrig om det (mutationerna är redan hopkopplade av anroparen), men
  // MemberOverview.tsx behöver det för att filtrera trådar på vald familj.
  accountId: Id;
  label: string;
  todos: Todo[];
  // Roster för "vem håller på med den här"-väljaren. Tom lista (eller
  // onToggleInProgress osatt) = ingen signup-gest för den här tråden — t.ex.
  // en Familjeanslutning, där jag saknar en riktig identitet i målkontot.
  members: { id: Id; name: string; color: string | null }[];
  onComplete: (todoId: Id) => void;
  onToggleInProgress?: (todoId: Id, targetMemberId: Id) => void;
  onToggleSubtask?: (todoId: Id, subtaskId: Id) => void;
  onCreateTodo?: (title: string, visual: string | null) => void;
  // Massradering + kategorihantering (2026-08-03, Zaidas önskemål: "kunna
  // massradera enkelt, utan att jag råkar göra det i misstag" + riktiga
  // familjekategorier) — bara satt för LOKALA konton (Familjen-poolen och
  // egna familjekategorier). Aldrig satt för cross-account/anslutnings-
  // trådar (att radera en annan familjs uppgift från min vy stöds inte).
  onDeleteTodo?: (todoId: Id) => void;
  // Bara satt för riktiga familjekategorier, aldrig för den fasta
  // Familjen-poolen eller Barn-liknande specialtrådar.
  onRenameCategory?: (name: string) => void;
  onDeleteCategory?: () => void;
  onHideCategory?: () => void;
  // Full redigering (2026-08-04, Zaidas önskemål: "det skall gå att
  // redigera i hemvyns todo, precis som i min personliga todovy") — bara
  // satt för LOKALA konton (samma gräns som onDeleteTodo/kategori-
  // hanteringen ovan). Aldrig satt för cross-account/anslutningstrådar,
  // döljer pennikonen i TodoDetailView där precis som tidigare.
  onEdit?: (todo: Todo) => void;
};

type Props = {
  sources: FamilyThreadSource[];
  todoBubbleOrder: Record<Id, Id[]>;
  onReorderBubbles: (threadId: Id, order: Id[]) => void;
  todoThreadGap?: number;
  todoBubbleSize?: number;
  // Sökruta i MemberOverview.tsx (2026-08-03) — filtrerar bubblorna i ALLA
  // trådar på titel, case-insensitive. Tom sträng = inget filter.
  searchQuery?: string;
  // Tidsspån (2026-08-04, Zaidas fynd: "Barnens rutiner lyckas visa
  // uppgifter i olika tidsspann, men inte mina egna todos... varken i min
  // personliga eller i familjens todo") — samma Inställningar → Utseende-
  // inställning som redan gäller ParentTodoThreadView.tsx:s trådar
  // (Barn/Mina uppgifter/kategorier), bara aldrig trådad hit. Default
  // "today" matchar det tidigare, ograviterade beteendet om en anropare
  // inte skickar med värdet.
  range?: TodoThreadRange;
};

export function FamilyTodoThreads({
  sources,
  todoBubbleOrder,
  onReorderBubbles,
  todoThreadGap,
  todoBubbleSize,
  searchQuery = "",
  range = "today"
}: Props) {
  const [detailTodoId, setDetailTodoId] = useState<Id | null>(null);
  const { heldId, startHold, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);
  const suppressClickRef = useRef(false);
  const lastTapRef = useRef<{ id: Id; time: number } | null>(null);
  const pendingClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inProgressPickerTodoId, setInProgressPickerTodoId] = useState<Id | null>(null);
  const [inProgressPickerPos, setInProgressPickerPos] = useState({ top: 0, left: 0 });
  const inProgressPickerRef = useRef<HTMLDivElement>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [dissolving, setDissolving] = useState<Map<Id, Todo>>(new Map());
  const dissolveTimersRef = useRef<Map<Id, ReturnType<typeof setTimeout>>>(new Map());
  const [showExpiredThreadIds, setShowExpiredThreadIds] = useState<Set<Id>>(new Set());
  const [menuThreadId, setMenuThreadId] = useState<Id | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [editingThreadId, setEditingThreadId] = useState<Id | null>(null);
  const CATEGORY_TAP_MS = 400;
  const categoryTapRef = useRef<{ id: Id; count: number; time: number } | null>(null);
  const categoryTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addingToThreadId, setAddingToThreadId] = useState<Id | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");

  // Massradering (2026-08-03) — egen, separat lägesstate (inte
  // editingThreadId, som styr drag-omordning) så de två aldrig krockar,
  // samma mönster som ParentTodoThreadView.tsx:s "Mina uppgifter"-tråd.
  const [selectingThreadId, setSelectingThreadId] = useState<Id | null>(null);
  const [selectedTodoIds, setSelectedTodoIds] = useState<Set<Id>>(new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  // Byt namn på en familjekategori (2026-08-03) — inline-formulär i samma
  // stil som "Lägg till uppgift"-formuläret nedan, inte en separat modal.
  const [renamingThreadId, setRenamingThreadId] = useState<Id | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Radera en familjekategori (2026-08-03) — tvåstegsbekräftelse INUTI
  // kategorimenyn (samma "tryck igen för att bekräfta"-princip som resten
  // av appens destruktiva knappar), återställs så fort menyn stängs.
  const [confirmingDeleteThreadId, setConfirmingDeleteThreadId] = useState<Id | null>(null);

  const bubbleDragStateRef = useRef<{ threadId: Id; key: Id; x: number; y: number } | null>(null);
  const [draggingBubbleKey, setDraggingBubbleKey] = useState<Id | null>(null);
  const [bubbleDragOverKey, setBubbleDragOverKey] = useState<Id | null>(null);

  const hasSharedTimer = sources.some((s) => s.todos.some((t) => (t.inProgressBy?.length ?? 0) >= 2));
  useEffect(() => {
    if (!hasSharedTimer) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasSharedTimer]);

  useEffect(
    () => () => {
      for (const timer of dissolveTimersRef.current.values()) clearTimeout(timer);
    },
    []
  );

  useEffect(() => {
    if (!menuThreadId) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuThreadId(null);
      setConfirmingDeleteThreadId(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuThreadId]);

  useEffect(() => {
    if (!inProgressPickerTodoId) return;
    function handleOutsideClick(e: MouseEvent) {
      if (inProgressPickerRef.current?.contains(e.target as Node)) return;
      setInProgressPickerTodoId(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [inProgressPickerTodoId]);

  useEffect(
    () => () => {
      if (pendingClickTimerRef.current) window.clearTimeout(pendingClickTimerRef.current);
    },
    []
  );

  function handleBubblePointerDown(e: React.PointerEvent<HTMLButtonElement>, threadId: Id, key: Id) {
    bubbleDragStateRef.current = { threadId, key, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleBubblePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const start = bubbleDragStateRef.current;
    if (!start) return;
    if (draggingBubbleKey === null) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      setDraggingBubbleKey(start.key);
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const li = el instanceof Element ? el.closest<HTMLElement>("[data-bubble-key]") : null;
    if (li && li.dataset.threadId === start.threadId) {
      setBubbleDragOverKey(li.dataset.bubbleKey as Id);
    } else {
      setBubbleDragOverKey(null);
    }
  }

  function handleBubblePointerUp(threadTodos: Todo[]) {
    const start = bubbleDragStateRef.current;
    const target = bubbleDragOverKey;
    bubbleDragStateRef.current = null;
    if (start && target && start.key !== target) {
      const keys = threadTodos.map(stableBubbleKey);
      const from = keys.indexOf(start.key);
      const to = keys.indexOf(target);
      if (from !== -1 && to !== -1) {
        const next = [...keys];
        next.splice(from, 1);
        next.splice(to, 0, start.key);
        onReorderBubbles(start.threadId, next);
      }
    }
    setDraggingBubbleKey(null);
    setBubbleDragOverKey(null);
  }

  function handleBallClick(source: FamilyThreadSource, todo: Todo, e: React.MouseEvent<HTMLButtonElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === todo.id && now - last.time < DOUBLE_TAP_MS) {
      if (pendingClickTimerRef.current) {
        window.clearTimeout(pendingClickTimerRef.current);
        pendingClickTimerRef.current = null;
      }
      lastTapRef.current = null;
      if (!source.onToggleInProgress || source.members.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ESTIMATED_WIDTH = 220;
      const ESTIMATED_HEIGHT = 260;
      setInProgressPickerPos({
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - ESTIMATED_HEIGHT)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - ESTIMATED_WIDTH))
      });
      setInProgressPickerTodoId(todo.id);
      return;
    }

    lastTapRef.current = { id: todo.id, time: now };
    pendingClickTimerRef.current = window.setTimeout(() => {
      setDetailTodoId(todo.id);
      pendingClickTimerRef.current = null;
    }, DOUBLE_TAP_MS);
  }

  function handleConfirmComplete(source: FamilyThreadSource, todo: Todo) {
    suppressClickRef.current = true;
    setDissolving((current) => new Map(current).set(todo.id, todo));
    source.onComplete(todo.id);
    const timer = setTimeout(() => {
      setDissolving((current) => {
        const next = new Map(current);
        next.delete(todo.id);
        return next;
      });
      dissolveTimersRef.current.delete(todo.id);
    }, DISSOLVE_DURATION_MS);
    dissolveTimersRef.current.set(todo.id, timer);
  }

  function handleThreadHeaderClick(source: FamilyThreadSource, event: React.MouseEvent<HTMLButtonElement>) {
    const now = Date.now();
    const last = categoryTapRef.current;
    const count = last && last.id === source.id && now - last.time < CATEGORY_TAP_MS ? last.count + 1 : 1;
    categoryTapRef.current = { id: source.id, count, time: now };
    if (categoryTapTimerRef.current) {
      window.clearTimeout(categoryTapTimerRef.current);
      categoryTapTimerRef.current = null;
    }

    if (count >= 3) {
      categoryTapRef.current = null;
      setMenuThreadId(null);
      setEditingThreadId((current) => (current === source.id ? null : source.id));
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    categoryTapTimerRef.current = window.setTimeout(() => {
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
      setMenuThreadId((current) => (current === source.id ? null : source.id));
      categoryTapTimerRef.current = null;
    }, CATEGORY_TAP_MS);
  }

  function handleToggleExpiredFromMenu(threadId: Id) {
    setMenuThreadId(null);
    setShowExpiredThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function openAddFromMenu(threadId: Id) {
    setMenuThreadId(null);
    setAddingToThreadId(threadId);
    setNewTodoTitle("");
  }

  function submitNewTodo(source: FamilyThreadSource) {
    const trimmed = newTodoTitle.trim();
    if (!trimmed || !source.onCreateTodo) return;
    source.onCreateTodo(trimmed, "⭐");
    setAddingToThreadId(null);
    setNewTodoTitle("");
  }

  // Massradering (2026-08-03) — "Välj flera" i kategorimenyn, tryck på en
  // bubbla för att kryssa i/ur, en åtgärdsrad visar antal valda + en
  // tvåstegsbekräftad "Ta bort"-knapp innan något faktiskt raderas.
  function startSelecting(threadId: Id) {
    setMenuThreadId(null);
    setSelectingThreadId(threadId);
    setSelectedTodoIds(new Set());
    setConfirmingBulkDelete(false);
  }

  function handleCancelSelecting() {
    setSelectingThreadId(null);
    setSelectedTodoIds(new Set());
    setConfirmingBulkDelete(false);
  }

  function toggleSelectedTodo(todoId: Id) {
    setSelectedTodoIds((current) => {
      const next = new Set(current);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
  }

  function handleBulkDeleteClick(source: FamilyThreadSource) {
    if (selectedTodoIds.size === 0) return;
    if (!confirmingBulkDelete) {
      setConfirmingBulkDelete(true);
      return;
    }
    for (const todoId of selectedTodoIds) {
      source.onDeleteTodo?.(todoId);
    }
    handleCancelSelecting();
  }

  // Byt namn på en familjekategori (2026-08-03).
  function startRename(source: FamilyThreadSource) {
    setMenuThreadId(null);
    setRenamingThreadId(source.id);
    setRenameValue(source.label);
  }

  function submitRename(source: FamilyThreadSource) {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== source.label) {
      source.onRenameCategory?.(trimmed);
    }
    setRenamingThreadId(null);
  }

  // Radera en familjekategori — tvåstegsbekräftelse inuti menyn (stannar
  // öppen mellan de två klicken, återställs annars vid utsidesklick, se
  // useEffect ovan).
  function handleDeleteCategoryClick(source: FamilyThreadSource) {
    if (confirmingDeleteThreadId !== source.id) {
      setConfirmingDeleteThreadId(source.id);
      return;
    }
    source.onDeleteCategory?.();
    setMenuThreadId(null);
    setConfirmingDeleteThreadId(null);
  }

  function handleHideCategoryFromMenu(source: FamilyThreadSource) {
    setMenuThreadId(null);
    source.onHideCategory?.();
  }

  const today = new Date();

  return (
    <div
      className="todo-thread-view"
      style={
        {
          ...(todoThreadGap != null ? { "--todo-thread-gap": `${todoThreadGap}px` } : {}),
          ...(todoBubbleSize != null ? { "--todo-bubble-size-override": `${todoBubbleSize}px` } : {})
        } as React.CSSProperties
      }
    >
      {sources.map((source) => {
        const showExpired = showExpiredThreadIds.has(source.id);
        const query = searchQuery.trim().toLowerCase();
        // Utgångna (missade) uppgifter är medvetet UTANFÖR range-filtret,
        // samma princip som ParentTodoThreadView.tsx — poängen med "Visa
        // utgångna" är att hitta det man missade oavsett valt tidsspann.
        // Håller-på-att-tona-bort (dissolving) bubblor bypassar filtret
        // helt, de ska aldrig försvinna abrupt mitt i animationen.
        // "Idag" = exakt klockslag (2026-08-04, Zaidas önskemål) — samma
        // hybrid som ParentTodoThreadView.tsx: "vecka"/"månad"/"allt" är
        // fortsatt dag-baserade (isDueWithinRange).
        const baseTodos = source.todos.filter(
          (t) =>
            (dissolving.has(t.id) ||
              (t.status === "pending" &&
                (range === "today" ? isTodoVisibleNow(t, nowTick) : isDueWithinRange(t, today, range))) ||
              (t.status === "expired" && showExpired)) &&
            (!query || t.title.toLowerCase().includes(query))
        );
        const threadTodos = applyBubbleOrder(sortByEndThenStartTime(baseTodos), todoBubbleOrder[source.id]);
        const isEditing = editingThreadId === source.id;
        const isSelecting = selectingThreadId === source.id;
        const isRenaming = renamingThreadId === source.id;

        return (
          <section
            aria-label={`Tråd: ${source.label}`}
            className={"todo-thread" + (isEditing ? " todo-thread--editing" : "")}
            data-thread-id={source.id}
            key={source.id}
          >
            <div className="todo-thread__header">
              {isRenaming ? (
                <form
                  className="todo-thread__add-form"
                  onSubmit={(e) => { e.preventDefault(); submitRename(source); }}
                >
                  <input
                    aria-label={`Nytt namn för ${source.label}`}
                    autoFocus
                    className="text-input"
                    onChange={(e) => setRenameValue(e.target.value)}
                    value={renameValue}
                  />
                  <button className="secondary-button" type="submit">Spara</button>
                  <button className="secondary-button" onClick={() => setRenamingThreadId(null)} type="button">
                    Avbryt
                  </button>
                </form>
              ) : (
                <h3 className="todo-thread__category">
                  <button
                    aria-expanded={menuThreadId === source.id}
                    aria-label={`${source.label}. Klicka för fler val, tre snabba tryck för att växla flyttläge.`}
                    aria-pressed={isEditing}
                    className="todo-thread__category-button"
                    onClick={(e) => handleThreadHeaderClick(source, e)}
                    type="button"
                  >
                    {source.label}
                  </button>
                </h3>
              )}

              {menuThreadId === source.id &&
                createPortal(
                  <div
                    className="todo-thread__category-menu"
                    ref={menuRef}
                    style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
                  >
                    {source.onCreateTodo && (
                      <button onClick={() => openAddFromMenu(source.id)} type="button">
                        Lägg till uppgift
                      </button>
                    )}
                    <button onClick={() => handleToggleExpiredFromMenu(source.id)} type="button">
                      {showExpiredThreadIds.has(source.id) ? "Dölj utgångna" : "Visa utgångna"}
                    </button>
                    {source.onDeleteTodo && (
                      <button onClick={() => startSelecting(source.id)} type="button">
                        Välj flera
                      </button>
                    )}
                    {source.onRenameCategory && (
                      <button onClick={() => startRename(source)} type="button">
                        Byt namn
                      </button>
                    )}
                    {source.onHideCategory && (
                      <button onClick={() => handleHideCategoryFromMenu(source)} type="button">
                        Göm
                      </button>
                    )}
                    {source.onDeleteCategory && (
                      <button onClick={() => handleDeleteCategoryClick(source)} type="button">
                        {confirmingDeleteThreadId === source.id ? "Bekräfta radering" : "Radera"}
                      </button>
                    )}
                  </div>,
                  document.body
                )}
            </div>

            {isSelecting && (
              <div className="todo-thread__select-bar">
                <span className="todo-thread__select-count">{selectedTodoIds.size} valda</span>
                <button
                  className="todo-thread__select-remove danger-button"
                  disabled={selectedTodoIds.size === 0}
                  onClick={() => handleBulkDeleteClick(source)}
                  type="button"
                >
                  {confirmingBulkDelete ? "Bekräfta radering" : "Ta bort"}
                </button>
                <button onClick={handleCancelSelecting} type="button">
                  Avbryt
                </button>
              </div>
            )}

            {threadTodos.length > 0 ? (
              <ul className="todo-thread__list">
                {threadTodos.map((todo) => {
                  const progress = computeProgress(todo);
                  const assignee = assigneeNameFor(todo, source.members as unknown as Member[]);
                  const assigneeColor = assigneeColorFor(todo, source.members as unknown as Member[]);
                  const isDissolving = dissolving.has(todo.id);
                  const inProgressMembers = (todo.inProgressBy ?? [])
                    .map((id) => source.members.find((m) => m.id === id))
                    .filter((m): m is { id: Id; name: string; color: string | null } => !!m);
                  const inProgressColor = inProgressMembers.length === 1 ? inProgressMembers[0].color ?? "var(--primary)" : null;
                  const sharedElapsedLabel =
                    inProgressMembers.length >= 2 && todo.inProgressSince
                      ? formatElapsed(nowTick - new Date(todo.inProgressSince).getTime())
                      : null;
                  const bubbleKey = stableBubbleKey(todo);

                  return (
                    <li
                      className={
                        "todo-thread__item" +
                        (isEditing && draggingBubbleKey === bubbleKey ? " todo-thread__item--dragging" : "") +
                        (isEditing && bubbleDragOverKey === bubbleKey && draggingBubbleKey !== bubbleKey
                          ? " todo-thread__item--drop-target"
                          : "")
                      }
                      data-bubble-key={bubbleKey}
                      data-thread-id={source.id}
                      key={todo.id}
                      style={
                        {
                          ...(assigneeColor ? { "--assignee-color": assigneeColor } : {}),
                          ...(inProgressColor ? { "--in-progress-color": inProgressColor } : {})
                        } as React.CSSProperties
                      }
                    >
                      <button
                        aria-label={
                          isSelecting
                            ? `${todo.title}${selectedTodoIds.has(todo.id) ? ", vald" : ""}. Tryck för att välja/avmarkera.`
                            : isEditing
                            ? `${todo.title}. Håll och dra för att flytta ordningen inom ${source.label}.`
                            : `${todo.title}, tilldelad ${assignee}` +
                              (progress !== null ? `, ${progress} procent av delmomenten avklarade` : "") +
                              (inProgressMembers.length > 0
                                ? `. ${inProgressMembers.map((m) => m.name).join(", ")} håller på med den här.`
                                : "") +
                              ". Håll intryckt i två sekunder för att markera hela uppgiften klar." +
                              (source.onToggleInProgress ? " Dubbeltryck för att signa upp dig." : "")
                        }
                        aria-pressed={isSelecting ? selectedTodoIds.has(todo.id) : undefined}
                        className={
                          "todo-thread__ball todo-thread__ball--home todo-thread__ball--small" +
                          (heldId === todo.id ? " todo-thread__ball--holding" : "") +
                          (isDissolving ? " todo-thread__ball--dissolving" : "") +
                          (inProgressColor ? " todo-thread__ball--in-progress" : "") +
                          (isEditing ? " todo-thread__ball--edit" : "") +
                          (isSelecting && selectedTodoIds.has(todo.id) ? " todo-thread__ball--selected" : "")
                        }
                        disabled={isDissolving}
                        onClick={(e) => {
                          if (isSelecting) { toggleSelectedTodo(todo.id); return; }
                          if (!isEditing) handleBallClick(source, todo, e);
                        }}
                        onPointerCancel={() => {
                          if (isSelecting) return;
                          if (isEditing) { handleBubblePointerUp(threadTodos); return; }
                          clearHold();
                        }}
                        onPointerDown={(e) => {
                          if (isSelecting) return;
                          if (isEditing) { handleBubblePointerDown(e, source.id, bubbleKey); return; }
                          startHold(todo.id, () => handleConfirmComplete(source, todo));
                        }}
                        onPointerLeave={isSelecting || isEditing ? undefined : clearHold}
                        onPointerMove={!isSelecting && isEditing ? handleBubblePointerMove : undefined}
                        onPointerUp={() => {
                          if (isSelecting) return;
                          if (isEditing) { handleBubblePointerUp(threadTodos); return; }
                          clearHold();
                        }}
                        title={todo.title}
                        type="button"
                      >
                        {todo.visual.value && (
                          <span aria-hidden="true" className="todo-thread__ball-icon">{todo.visual.value}</span>
                        )}
                        <span className="todo-thread__ball-title">{todo.title}</span>
                        {progress !== null && <span className="todo-thread__ball-progress">{progress}%</span>}
                      </button>

                      {inProgressMembers.length >= 2 && (
                        <div aria-hidden="true" className="todo-thread__in-progress">
                          <span className="todo-thread__in-progress-dots">
                            {inProgressMembers.map((m) => (
                              <span
                                className="todo-thread__in-progress-dot"
                                key={m.id}
                                style={{ background: m.color ?? "var(--primary)" }}
                              />
                            ))}
                          </span>
                          <span className="todo-thread__in-progress-clock">{sharedElapsedLabel}</span>
                        </div>
                      )}

                      {inProgressPickerTodoId === todo.id &&
                        source.onToggleInProgress &&
                        createPortal(
                          <div
                            className="todo-thread__category-menu"
                            ref={inProgressPickerRef}
                            role="menu"
                            style={{ position: "fixed", top: inProgressPickerPos.top, left: inProgressPickerPos.left }}
                          >
                            <p className="todo-thread__in-progress-picker-label">Vem håller på med den här?</p>
                            {source.members.map((m) => {
                              const isOn = inProgressMembers.some((im) => im.id === m.id);
                              return (
                                <button
                                  aria-pressed={isOn}
                                  key={m.id}
                                  onClick={() => {
                                    source.onToggleInProgress?.(todo.id, m.id);
                                    setInProgressPickerTodoId(null);
                                  }}
                                  type="button"
                                >
                                  {isOn ? "✓ " : ""}
                                  {m.name}
                                </button>
                              );
                            })}
                          </div>,
                          document.body
                        )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="todo-thread__empty">Allt avklarat här 🎉</p>
            )}

            {addingToThreadId === source.id && (
              <form
                className="todo-thread__add-form"
                onSubmit={(e) => { e.preventDefault(); submitNewTodo(source); }}
              >
                <input
                  aria-label="Lägg till en uppgift"
                  autoFocus
                  className="text-input"
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  placeholder="Lägg till en uppgift…"
                  value={newTodoTitle}
                />
                <button className="secondary-button" type="submit">Lägg till</button>
              </form>
            )}
          </section>
        );
      })}

      {detailTodoId &&
        sources.flatMap((s) => s.todos.map((t) => ({ source: s, todo: t }))).find((x) => x.todo.id === detailTodoId) &&
        (() => {
          const match = sources
            .flatMap((s) => s.todos.map((t) => ({ source: s, todo: t })))
            .find((x) => x.todo.id === detailTodoId)!;
          return (
            <TodoDetailView
              assigneeColor={assigneeColorFor(match.todo, match.source.members as unknown as Member[])}
              assigneeName={assigneeNameFor(match.todo, match.source.members as unknown as Member[])}
              categoryName={null}
              members={match.source.members as unknown as Member[]}
              onClose={() => setDetailTodoId(null)}
              onEdit={
                match.source.onEdit
                  ? () => {
                      setDetailTodoId(null);
                      match.source.onEdit!(match.todo);
                    }
                  : undefined
              }
              onToggleSubtask={(todoId, subtaskId) => match.source.onToggleSubtask?.(todoId, subtaskId)}
              todo={match.todo}
            />
          );
        })()}
    </div>
  );
}
