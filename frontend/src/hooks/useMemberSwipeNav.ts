import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";

// Bläddra mellan familjemedlemmar i barnets dashboard (2026-08-09, Zaidas
// önskemål) — touch: ett enkelt vågrätt svep var som helst i vyn ("det
// räcker med att svajpa med ett finger vågrät över skärmen", inte tre
// fingrar). Mus/desktop: ett striktare, avsiktligt svårare-att-råka-göra
// mönster — nedtryck måste ske i vänster/höger marginal, och markören måste
// dras hela vägen över till andra sidan innan man släpper.
//
// Pointer Events (inte råa Touch Events) — samma konvention som
// useDragReorder.ts/useResizableTextarea.ts redan etablerat i den här
// kodbasen, en enda kodväg täcker mus OCH touch. Ingen setPointerCapture
// här (till skillnad från de hookarna) — den här lyssnaren sitter på en
// bred, hela-vyn-omslutande container och skulle annars kapa pekar-events
// från barn-element (t.ex. uppgiftskortens egen håll-in-för-att-avklara-
// gest i ChildTasksSection.tsx) innan de når sina egna onPointerDown/Up.
const TOUCH_SWIPE_THRESHOLD_PX = 60;
const DESKTOP_MARGIN_PX = 48;
const DESKTOP_CROSS_RATIO = 0.6;

type Options = {
  onNext: () => void;
  onPrev: () => void;
};

type SwipeStart = {
  pointerId: number;
  x: number;
  y: number;
  isMouse: boolean;
};

export function useMemberSwipeNav({ onNext, onPrev }: Options) {
  const startRef = useRef<SwipeStart | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    // Ett spårat svep pågår redan — ignorera ytterligare fingrar/knappar
    // tills det avslutas (samma "bara den FÖRSTA pekaren räknas"-princip
    // som redan skyddar mot flera samtidiga tryck i andra gester i appen).
    if (startRef.current) return;
    const isMouse = e.pointerType === "mouse";
    if (isMouse) {
      const rect = e.currentTarget.getBoundingClientRect();
      const inLeftMargin = e.clientX - rect.left <= DESKTOP_MARGIN_PX;
      const inRightMargin = rect.right - e.clientX <= DESKTOP_MARGIN_PX;
      if (!inLeftMargin && !inRightMargin) return;
    }
    startRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, isMouse };
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const start = startRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    startRef.current = null;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (start.isMouse) {
      // "dra den nedtryckta markören över till andra sidan innan man
      // släpper" — kräver en stor andel av bredden, inte bara några pixlar,
      // så en vanlig textmarkering eller ett litet muspekar-skutt aldrig
      // räknas som en växling av misstag.
      const rect = e.currentTarget.getBoundingClientRect();
      const width = rect.width || 1;
      if (Math.abs(dx) < width * DESKTOP_CROSS_RATIO) return;
    } else {
      // Vågrätt dominant och tillräckligt långt — skiljer ett avsiktligt
      // svep från en vanlig vertikal skroll (t.ex. i uppgiftslistan).
      if (Math.abs(dx) < TOUCH_SWIPE_THRESHOLD_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.5) return;
    }

    // Svep/dra åt vänster = nästa medlem, åt höger = föregående — samma
    // riktningskonvention som ett bildspel/karusell.
    if (dx < 0) onNext();
    else onPrev();
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
    if (startRef.current?.pointerId === e.pointerId) startRef.current = null;
  }

  return { onPointerDown, onPointerUp, onPointerCancel };
}
