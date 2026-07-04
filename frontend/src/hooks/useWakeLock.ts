import { useEffect, useRef } from "react";

// Håller skärmen vaken via Screen Wake Lock API så länge `active` är true —
// annars kan enheten självslockna medan ett rekordförsök pågår (barnet kan inte
// se tidräknaren, eller måste låsa upp igen för att hinna trycka Stoppa).
// Webbläsare utan stöd (t.ex. äldre Safari) ignoreras tyst — ingen kritisk
// funktion sitter bakom det här, bara en bekvämlighet.
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
      } catch {
        // Nekad (t.ex. lågt batteri, dold flik) — inget kritiskt, ignorera.
      }
    }

    void acquire();

    // Webbläsaren släpper wake locken automatiskt när fliken döljs — återta den
    // om fliken blir synlig igen medan tidtagningen fortfarande pågår.
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
