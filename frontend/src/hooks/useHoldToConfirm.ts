import { useEffect, useRef, useState } from "react";

// Generisk håll-in-N-sekunder-för-att-bekräfta — samma mönster som barnens
// håll-för-att-avklara på uppdragskort (useChildCompleteHold), återanvänds här så
// t.ex. gratis belöningar (0 kr, inget att dra pengar till) kan bekräftas likadant.
export function useHoldToConfirm(durationMs: number) {
  const [heldId, setHeldId] = useState<string | null>(null);
  const holdRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (holdRef.current !== null) window.clearTimeout(holdRef.current);
    },
    []
  );

  function clearHold() {
    if (holdRef.current !== null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    setHeldId(null);
  }

  function startHold(id: string, onConfirm: () => void) {
    clearHold();
    setHeldId(id);
    holdRef.current = window.setTimeout(() => {
      onConfirm();
      holdRef.current = null;
      setHeldId(null);
    }, durationMs);
  }

  return { heldId, startHold, clearHold };
}
