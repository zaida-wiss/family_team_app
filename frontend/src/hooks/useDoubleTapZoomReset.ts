import { useEffect } from "react";

const DOUBLE_TAP_MAX_INTERVAL_MS = 350;
const DOUBLE_TAP_MAX_DISTANCE_PX = 40;
const VIEWPORT_LOCK_HOLD_MS = 350;

// Zaida: "jag hamnar ofta i ett störande inzoomningsläge... ett dubbelklick på
// skärmen borde återställa normalt läge" (2026-08-30). Pinch-zoom lämnas
// medvetet orört (WCAG 1.4.4/1.4.10 kräver att zoom förblir möjligt, se redan
// existerande touch-action:pinch-zoom-kommentarer i ChildDashboard.css/
// ChildTasks.css) — den här hooken ger bara en snabb väg TILLBAKA till 100%.
// Tricket: <meta name=viewport>s maximum-scale tvingar mobila webbläsare att
// omedelbart snäppa tillbaka till angiven skala, oavsett hur inzoomad
// sidan råkar vara just nu. Vi sätter den bara en kort stund — annars hade vi
// permanent stängt av pinch-zoom, samma otillgängliga beteende vi vill
// undvika.
export function useDoubleTapZoomReset() {
  useEffect(() => {
    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewportMeta) return;
    const viewport = viewportMeta;
    const originalContent = viewport.content;
    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let releaseTimer: number | undefined;

    function handleTouchEnd(e: TouchEvent) {
      if (e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const now = Date.now();
      const isDoubleTap =
        now - lastTapAt < DOUBLE_TAP_MAX_INTERVAL_MS &&
        Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY) < DOUBLE_TAP_MAX_DISTANCE_PX;
      lastTapAt = isDoubleTap ? 0 : now;
      lastTapX = touch.clientX;
      lastTapY = touch.clientY;
      if (!isDoubleTap) return;

      viewport.content = `${originalContent}, maximum-scale=1.0`;
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        viewport.content = originalContent;
      }, VIEWPORT_LOCK_HOLD_MS);
    }

    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchend", handleTouchEnd);
      window.clearTimeout(releaseTimer);
      viewport.content = originalContent;
    };
  }, []);
}
