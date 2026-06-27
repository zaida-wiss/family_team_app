import { useCallback, useRef } from "react";

export function useLongPress(
  onActivate: () => void,
  onActivatedRelease: (e: React.PointerEvent) => void,
  delay = 1000
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activatedRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Capture the pointer so pointermove/pointerup fire here even when finger moves away
      e.currentTarget.setPointerCapture(e.pointerId);
      activatedRef.current = false;
      timerRef.current = setTimeout(() => {
        activatedRef.current = true;
        onActivate();
      }, delay);
    },
    [onActivate, delay]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (activatedRef.current) {
        activatedRef.current = false;
        onActivatedRelease(e);
      }
    },
    [onActivatedRelease]
  );

  const onPointerCancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    activatedRef.current = false;
  }, []);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
