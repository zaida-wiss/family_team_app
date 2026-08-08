import { useCallback, useRef } from "react";

// Bläddra mellan familjemedlemmar i barnets dashboard (2026-08-09, Zaidas
// önskemål) — touch: ett enkelt vågrätt svep var som helst i vyn. Mus/
// desktop: nedtryck måste ske i vänster/höger marginal, markören måste
// dras hela vägen över till andra sidan innan man släpper. Bläddringen
// cyklar runt i oändlighet (sista→första, första→sista) via
// goToRelativeMember i MemberShellContent.tsx, inte den här hooken.
//
// 2026-08-09, uppföljning (Zaidas fynd: "det är fortfarande svårt att
// svajpa... kan det bero på att skärmen rör sig upp och ner?", sedan "om
// fingret inte dras exakt vågrät utan några grader i en annan vinkel så
// fungerar inte swipet") — en ren touch-action-begränsning
// (se ChildDashboard.css) räcker INTE ensam: så fort fingret rör sig det
// minsta lodrätt (helt normalt, ingen håller fingret perfekt vågrätt genom
// hela gesten) kan webbläsaren hinna tolka rörelsen som sin EGEN, native
// lodräta panorering/skroll INNAN gesten hunnit avslutas — det är just det
// som UPPLEVS som "skärmen rör sig upp och ner", och webbläsaren skickar då
// ofta ett pointercancel istället för ett rent pointerup, vilket tyst dödade
// svepet. touch-action deklarerar bara VAD som är TILLÅTET, det stoppar
// inte en redan pågående rörelse.
//
// Löst genom att själv lyssna på pointermove (native addEventListener,
// INTE Reacts onPointerMove-props — måste kunna registreras med
// passive:false för att preventDefault() garanterat ska stoppa webbläsarens
// egen panorering) och tidigt (redan efter 10px rörelse) LÅSA gestens axel:
// är den vågrätt dominant (bara |dx|>|dy|, INTE 1,5x eller mer — en
// generös tröskel, ett par graders avvikelse ska fortfarande räknas som
// ett vågrätt svep) tar vi över den direkt (preventDefault på VARJE
// efterföljande pointermove, så webbläsaren aldrig hinner kapa den) — är
// den lodrätt dominant släpper vi den helt (ingen preventDefault, vanlig
// skroll i t.ex. uppgiftslistan fortsätter fungera precis som innan).
//
// Callback-ref, INTE en vanlig useRef+useEffect([]) (2026-08-09, fångat vid
// granskning innan utskick) — MemberShellContent.tsx:s div (den denna hook
// fästs på) monteras/avmonteras om varje gång man öppnar/stänger Rekord-
// sidan (som returnerar en Suspense direkt, utan den omslutande diven) —
// en effekt med tom beroendelista körs bara EN gång per KOMPONENTINSTANS,
// inte en gång per DOM-nod, och hade lämnat lyssnarna dött fästa vid den
// FÖRSTA, sedan länge bortkopplade diven efter en enda tur till Rekord och
// tillbaka. En callback-ref anropas av React vid VARJE nod-byte (null vid
// avmontering, elementet vid montering) och fäster/lösgör lyssnarna då.
//
// 2026-08-09, uppföljning (CI: musdrag-testet gick inte att slutföra, verifierat
// deterministiskt två gånger inklusive en automatisk omkörning, ingen
// slumpmässig instabilitet) — setPointerCapture saknades helt för mus. Utan
// den avgör webbläsaren VILKET element ett pointerup landar på baserat på
// var muspekaren FYSISKT befinner sig vid släppet — hamnar den ens någon
// enstaka pixel utanför denna diven (t.ex. om en delpixel-avrundning gör att
// dragets slutposition landar precis på en angränsande yta) bubblar
// pointerup ALDRIG hit, och gesten avslutas tyst utan att växla, trots att
// den visuellt såg klar ut. setPointerCapture (bara för mus — touch lämnas
// medvetet ofångad, se filens huvudkommentar om varför) tvingar ALLA
// efterföljande events för samma pointerId till DENNA nod oavsett var
// pekaren fysiskt är, precis som useDragReorder.ts/useResizableTextarea.ts
// redan gör av samma anledning.
const TOUCH_SWIPE_THRESHOLD_PX = 60;
const AXIS_LOCK_THRESHOLD_PX = 10;
const DESKTOP_MARGIN_PX = 48;
const DESKTOP_CROSS_RATIO = 0.6;

type Options = {
  onNext: () => void;
  onPrev: () => void;
};

type GestureState = {
  pointerId: number;
  x: number;
  y: number;
  isMouse: boolean;
  axis: "unknown" | "horizontal" | "vertical";
};

export function useMemberSwipeNav<T extends HTMLElement>({ onNext, onPrev }: Options) {
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);
  onNextRef.current = onNext;
  onPrevRef.current = onPrev;

  const cleanupRef = useRef<(() => void) | null>(null);

  const setRef = useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const gestureRef: { current: GestureState | null } = { current: null };

    function onPointerDown(e: PointerEvent) {
      // Ett spårat svep pågår redan — ignorera ytterligare fingrar/knappar.
      if (gestureRef.current) return;
      const isMouse = e.pointerType === "mouse";
      if (isMouse) {
        const rect = el!.getBoundingClientRect();
        const inLeftMargin = e.clientX - rect.left <= DESKTOP_MARGIN_PX;
        const inRightMargin = rect.right - e.clientX <= DESKTOP_MARGIN_PX;
        if (!inLeftMargin && !inRightMargin) return;
        // Garanterar att pointerup landar HÄR oavsett var muspekaren
        // fysiskt slutar (se filens huvudkommentar) — bara för mus, aldrig
        // touch (skulle annars kapa pekar-events från barn-element som
        // ChildTasksSection.tsx:s håll-in-för-att-avklara).
        el!.setPointerCapture(e.pointerId);
      }
      gestureRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, isMouse, axis: "unknown" };
    }

    function onPointerMove(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId || g.isMouse) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.axis === "unknown") {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_THRESHOLD_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      if (g.axis === "horizontal") {
        e.preventDefault();
      }
    }

    function onPointerUp(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      gestureRef.current = null;
      if (g.isMouse && el!.hasPointerCapture(e.pointerId)) {
        el!.releasePointerCapture(e.pointerId);
      }

      const dx = e.clientX - g.x;

      if (g.isMouse) {
        // "dra den nedtryckta markören över till andra sidan innan man
        // släpper" — kräver en stor andel av bredden, inte bara några
        // pixlar, så en vanlig textmarkering aldrig räknas som en växling.
        const rect = el!.getBoundingClientRect();
        const width = rect.width || 1;
        if (Math.abs(dx) < width * DESKTOP_CROSS_RATIO) return;
      } else {
        // Axeln redan låst i onPointerMove — bara den totala vågräta
        // sträckan behöver kollas här, ingen ny vinkel-kontroll.
        if (g.axis !== "horizontal") return;
        if (Math.abs(dx) < TOUCH_SWIPE_THRESHOLD_PX) return;
      }

      // Svep/dra åt vänster = nästa medlem, åt höger = föregående — samma
      // riktningskonvention som ett bildspel/karusell.
      if (dx < 0) onNextRef.current();
      else onPrevRef.current();
    }

    function onPointerCancel(e: PointerEvent) {
      const g = gestureRef.current;
      if (g?.pointerId === e.pointerId) {
        gestureRef.current = null;
        if (g.isMouse && el!.hasPointerCapture(e.pointerId)) {
          el!.releasePointerCapture(e.pointerId);
        }
      }
    }

    el.addEventListener("pointerdown", onPointerDown);
    // passive:false — krävs för att preventDefault() i onPointerMove
    // garanterat ska hindra webbläsarens egen panorering, inte bara
    // "försöka".
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);

    cleanupRef.current = () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
  }, []);

  return setRef;
}
