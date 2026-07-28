import { useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 8;

// Generisk pointer-baserad håll-och-dra-omordning (2026-07-29) — samma
// mekanism som redan används för kategori-/bubbel-omordning i
// ParentTodoThreadView.tsx, utbruten hit så RecurringTodosSettings.tsx/
// TemplatesSettings.tsx (Zaidas önskemål: "flytta ordningen snabbt", drag
// istället för att klicka pil-för-pil) kan återanvända den utan att
// duplicera pointer-hanteringen. Ett drag-mål identifieras via ett delat
// data-attribut (dataAttr, default "data-drag-key") på varje rad.
export function useDragReorder<T extends string>(
  order: T[],
  onReorder: (order: T[]) => void,
  dataAttr = "data-drag-key"
) {
  const dragStateRef = useRef<{ key: T; x: number; y: number } | null>(null);
  const [draggingKey, setDraggingKey] = useState<T | null>(null);
  const [dragOverKey, setDragOverKey] = useState<T | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLElement>, key: T) {
    dragStateRef.current = { key, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
    const start = dragStateRef.current;
    if (!start) return;
    if (draggingKey === null) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      setDraggingKey(start.key);
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el instanceof Element ? el.closest<HTMLElement>(`[${dataAttr}]`) : null;
    setDragOverKey(row ? (row.getAttribute(dataAttr) as T) : null);
  }

  function handlePointerUp() {
    const start = dragStateRef.current;
    const target = dragOverKey;
    dragStateRef.current = null;
    if (start && target && start.key !== target) {
      const from = order.indexOf(start.key);
      const to = order.indexOf(target);
      if (from !== -1 && to !== -1) {
        const next = [...order];
        next.splice(from, 1);
        next.splice(to, 0, start.key);
        onReorder(next);
      }
    }
    setDraggingKey(null);
    setDragOverKey(null);
  }

  return { draggingKey, dragOverKey, handlePointerDown, handlePointerMove, handlePointerUp };
}
