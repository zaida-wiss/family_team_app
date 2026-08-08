import { useEffect, useRef, useState } from "react";

type DragState = { id: string; dy: number; armed: boolean };

// Håll-in + dra uppåt-bekräftelse (2026-08-10) — samma håll-in-N-sekunder-
// princip som useHoldToConfirm, men kräver DESSUTOM att pekaren dragits
// uppåt förbi ett tröskelvärde NÅGON GÅNG under hållet (sticky — en gång
// uppnått krävs inte att pekaren stannar kvar där) innan håll-timern får
// bekräfta. Byggd för ChildPendingBadges.tsx:s "ångra klarmarkering"-gest
// (håll den snurrande badgen, dra den uppåt mot uppdragskortens plats) —
// en egen, från useHoldToConfirm separat hook eftersom den behöver spåra
// pekarens Y-position också, inte bara en timer.
export function useHoldDragConfirm(durationMs: number, dragThresholdPx: number) {
  const [state, setState] = useState<DragState | null>(null);
  const holdRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const startYRef = useRef(0);
  const armedRef = useRef(false);
  const onConfirmRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      if (holdRef.current !== null) window.clearTimeout(holdRef.current);
    },
    []
  );

  function clear() {
    if (holdRef.current !== null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    armedRef.current = false;
    onConfirmRef.current = null;
    setState(null);
  }

  function start(id: string, clientY: number, onConfirm: () => void) {
    clear();
    startYRef.current = clientY;
    onConfirmRef.current = onConfirm;
    setState({ id, dy: 0, armed: false });
    holdRef.current = window.setTimeout(() => {
      holdRef.current = null;
      const confirm = onConfirmRef.current;
      const armed = armedRef.current;
      clear();
      if (armed && confirm) confirm();
    }, durationMs);
  }

  function move(clientY: number) {
    setState((current) => {
      if (!current) return current;
      const dy = Math.max(0, startYRef.current - clientY);
      const armed = armedRef.current || dy >= dragThresholdPx;
      armedRef.current = armed;
      return { ...current, dy, armed };
    });
  }

  return { state, start, move, clear };
}
