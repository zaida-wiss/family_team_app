import { useRef, useState } from "react";

const MIN_HEIGHT_PX = 60;

// Egen, touch-vänlig resize-handtag för anteckningsfält (2026-08-08, Zaidas
// fynd: "anteckningar är inte reglerbart på små skärmar, tex i mobilen") —
// native CSS `resize` (redan satt via .text-input/.cal-notes på flera ställen)
// ritar bara ett drag-handtag som fungerar med MUS, de flesta mobila
// webbläsare stödjer inte att dra i det med touch alls. Samma pointer-
// baserade mönster som useDragReorder.ts (fungerar för mus OCH touch genom
// samma kod, ingen separat touch-hantering behövs).
export function useResizableTextarea(defaultHeightPx = 76) {
  const [height, setHeight] = useState(defaultHeightPx);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLElement>) {
    e.preventDefault();
    dragStateRef.current = { startY: e.clientY, startHeight: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
    const start = dragStateRef.current;
    if (!start) return;
    const maxHeight = Math.max(MIN_HEIGHT_PX, window.innerHeight * 0.6);
    const next = Math.min(maxHeight, Math.max(MIN_HEIGHT_PX, start.startHeight + (e.clientY - start.startY)));
    setHeight(next);
  }

  function handlePointerUp() {
    dragStateRef.current = null;
  }

  return {
    height,
    textareaStyle: { height: `${height}px` } as const,
    handleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp
    }
  };
}
