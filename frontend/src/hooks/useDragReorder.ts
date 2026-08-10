import { useRef, useState } from "react";

const DRAG_THRESHOLD_PX = 8;

type DragStart<K extends string> = { key: K; group: string | null; x: number; y: number };

// Generisk pointer-baserad håll-och-dra-omordning (2026-07-29, generaliserad
// 2026-08-10, Sprint 9 S4: konsolidering av tre separata implementationer —
// se teamgenomgang-2026-08-10.md). EN hook-instans hanterar dragläget; varje
// anropsställe skickar in SIN EGEN aktuella ordning + onReorder-callback vid
// PointerUp istället för att binda dem vid hook-konstruktion. Det löser två
// saker samtidigt: (1) ett DYNAMISKT antal grupper (t.ex. en drag-yta per
// inköpslista, som kan bli fler/färre) kan servas av EN hook-instans — att
// anropa hooken en gång PER GRUPP inuti en `.map()` bryter mot Reglerna om
// Hooks; (2) en grupps "aktuella ordning" kan vara HÄRLEDD (t.ex.
// ShoppingListCard.tsx:s useDelayedCompletionSort) och måste läsas FÄRSKT
// vid själva släppet, inte cachas vid hook-konstruktion.
// `group` (valfritt, satt vid PointerDown) förhindrar bara en missvisande
// drag-över-markering på en rad som hör till en ANNAN grupp — själva
// omordningen är redan säker utan den (en främmande nyckel hittas aldrig i
// den egna `order`-arrayen vid PointerUp, no-opar tyst).
export function useDragReorder<K extends string>(dataAttr = "data-drag-key", groupAttr?: string) {
  const dragStateRef = useRef<DragStart<K> | null>(null);
  const [draggingKey, setDraggingKey] = useState<K | null>(null);
  const [dragOverKey, setDragOverKey] = useState<K | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLElement>, key: K, group?: string) {
    dragStateRef.current = { key, group: group ?? null, x: e.clientX, y: e.clientY };
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
    if (row && groupAttr && start.group !== null && row.getAttribute(groupAttr) !== start.group) {
      setDragOverKey(null);
      return;
    }
    setDragOverKey(row ? (row.getAttribute(dataAttr) as K) : null);
  }

  function handlePointerUp(order: K[], onReorder: (order: K[]) => void) {
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
