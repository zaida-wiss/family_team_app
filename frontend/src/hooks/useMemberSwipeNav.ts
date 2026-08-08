import { useCallback, useRef } from "react";

// Bläddra mellan familjemedlemmar i barnets dashboard (2026-08-09, Zaidas
// önskemål) — touch: ett enkelt vågrätt svep var som helst i vyn. Mus/
// desktop: nedtryck måste ske i vänster/höger marginal, markören måste
// dras hela vägen över till andra sidan innan man släpper. Bläddringen
// cyklar runt i oändlighet (sista→första, första→sista) via
// goToRelativeMember i MemberShellContent.tsx, inte den här hooken.
//
// 2026-08-09, uppföljning #1 (Zaidas fynd: "det är fortfarande svårt att
// svajpa... kan det bero på att skärmen rör sig upp och ner?", sedan "om
// fingret inte dras exakt vågrät utan några grader i en annan vinkel så
// fungerar inte swipet") — en ren touch-action-begränsning
// (se ChildDashboard.css) räcker INTE ensam: så fort fingret rör sig det
// minsta lodrätt (helt normalt, ingen håller fingret perfekt vågrätt genom
// hela gesten) kan webbläsaren hinna tolka rörelsen som sin EGEN, native
// lodräta panorering/skroll INNAN gesten hunnit avslutas — det är just det
// som UPPLEVS som "skärmen rör sig upp och ner". Löst genom att själv
// lyssna på pointermove (native addEventListener, INTE Reacts
// onPointerMove-props — måste kunna registreras med passive:false för att
// preventDefault() garanterat ska stoppa webbläsarens egen panorering) och
// tidigt (redan efter några pixlars rörelse) LÅSA gestens axel.
//
// 2026-08-09, uppföljning #2 (CI: musdrag-testet gick inte att slutföra) —
// setPointerCapture saknades för mus, tillagd (se onPointerDown).
//
// 2026-08-09, uppföljning #3 (Zaidas fynd: "just nu flyttar sig skärmen.
// Jag vill att den skall vara fast som navbaren", samtidigt med "jag vill
// att det ska vara lika lätt som när man svajpar på tinder") — två separata
// problem löstes tillsammans:
//
//   1. Skärmen flyttade sig: under den OSÄKRA perioden (innan axeln hunnit
//      låsas) kallades preventDefault() ALDRIG — om de första pixlarnas
//      rörelse råkade ha ett litet lodrätt inslag (i praktiken nästan alltid
//      fallet för en mänsklig fingerrörelse) hann webbläsaren redan BÖRJA
//      sin egen lodräta panorering innan vår kod bestämt sig för "vågrät" —
//      den panoreringen ångras aldrig retroaktivt av ett senare
//      preventDefault(), utan syns som ett litet hopp/studs. Löst genom att
//      kalla preventDefault() på VARJE rörelseevent redan UNDER den osäkra
//      perioden (inte bara efter låsning) — kostar en försumbar (några
//      pixlars) fördröjning innan en RIKTIG lodrät skroll får starta ifall
//      gesten visar sig vara lodrät, i utbyte mot att en vågrät svep-gest
//      ALDRIG kan orsaka ens en enda oavsiktlig pixels sidscroll.
//   2. "Lika lätt som Tinder": svepet gav tidigare INGEN visuell feedback
//      förrän fingret släpptes — användaren kunde inte se att gesten
//      registrerats, vilket gjorde den overksam/opålitlig KÄNSLAN oavsett
//      hur korrekt detektionen egentligen var. Innehållet följer nu fingret
//      1:1 (translateX, satt direkt via DOM — INTE via React-state, som
//      hade gett en omrendering per pixel) medan man drar, och antingen
//      glider hela vägen ut åt sidan (svep över tröskeln, som ett bortsvept
//      Tinder-kort) eller fjädrar tillbaka till sin plats (under tröskeln).
const TOUCH_SWIPE_THRESHOLD_PX = 60;
const AXIS_LOCK_THRESHOLD_PX = 8;
const DESKTOP_MARGIN_PX = 48;
const DESKTOP_CROSS_RATIO = 0.6;
const SNAP_BACK_MS = 200;
const EXIT_MS = 180;

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
    // Blockerar en NY gest medan förra gestens bortsvep-animation fortfarande
    // spelar (2026-08-09) — annars kan ett snabbt andra svep starta mitt i
    // en pågående translateX-övergång och se ryckigt/dubbelt ut.
    let animating = false;
    el.style.willChange = "transform";

    function follow(dx: number) {
      el!.style.transition = "none";
      el!.style.transform = `translateX(${dx}px)`;
    }

    function snapBack() {
      el!.style.transition = `transform ${SNAP_BACK_MS}ms ease-out`;
      el!.style.transform = "translateX(0px)";
      window.setTimeout(() => {
        el!.style.transition = "";
      }, SNAP_BACK_MS);
    }

    function commit(dx: number) {
      animating = true;
      const width = el!.getBoundingClientRect().width || 1;
      const exitX = dx < 0 ? -width : width;
      el!.style.transition = `transform ${EXIT_MS}ms ease-in`;
      el!.style.transform = `translateX(${exitX}px)`;
      window.setTimeout(() => {
        // Nollställs INNAN nästa medlems innehåll hinner målas, så det
        // renderas på sin vanliga plats istället för att vara kvar
        // bortskjutet (samma div/ref återanvänds av React vid bytet).
        el!.style.transition = "";
        el!.style.transform = "";
        animating = false;
        if (dx < 0) onNextRef.current();
        else onPrevRef.current();
      }, EXIT_MS);
    }

    function onPointerDown(e: PointerEvent) {
      // Ett spårat svep pågår redan, eller en bortsvepsanimation spelar —
      // ignorera ytterligare fingrar/knappar tills den är klar.
      if (gestureRef.current || animating) return;
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
      if (!g || g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;

      if (g.isMouse) {
        // Redan godkänd att svepa (start i marginalen, pointer capture
        // aktiv) — ingen axel-låsning behövs, följ bara muspekaren direkt.
        follow(dx);
        return;
      }

      if (g.axis === "unknown") {
        // Håller webbläsarens egen panorering borta redan under den osäkra
        // perioden — se filhuvudets uppföljning #3, punkt 1.
        e.preventDefault();
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_THRESHOLD_PX) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      if (g.axis === "horizontal") {
        e.preventDefault();
        follow(dx);
      }
      // g.axis === "vertical": släpper helt (ingen preventDefault, ingen
      // follow()) — vanlig skroll i t.ex. uppgiftslistan fortsätter
      // fungera precis som innan.
    }

    function onPointerUp(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      gestureRef.current = null;
      if (g.isMouse && el!.hasPointerCapture(e.pointerId)) {
        el!.releasePointerCapture(e.pointerId);
      }

      const dx = e.clientX - g.x;
      let crossed: boolean;

      if (g.isMouse) {
        // "dra den nedtryckta markören över till andra sidan innan man
        // släpper" — kräver en stor andel av bredden, inte bara några
        // pixlar, så en vanlig textmarkering aldrig räknas som en växling.
        const rect = el!.getBoundingClientRect();
        const width = rect.width || 1;
        crossed = Math.abs(dx) >= width * DESKTOP_CROSS_RATIO;
      } else if (g.axis !== "horizontal") {
        // Aldrig ens låst till vågrät (rent lodrätt svep, eller för kort
        // rörelse för att axeln hann bestämmas) — ingen egen visuell
        // förskjutning att fjädra tillbaka, gör ingenting.
        return;
      } else {
        crossed = Math.abs(dx) >= TOUCH_SWIPE_THRESHOLD_PX;
      }

      // Svep/dra åt vänster = nästa medlem, åt höger = föregående — samma
      // riktningskonvention som ett bildspel/karusell.
      if (crossed) commit(dx);
      else snapBack();
    }

    function onPointerCancel(e: PointerEvent) {
      const g = gestureRef.current;
      if (g?.pointerId === e.pointerId) {
        gestureRef.current = null;
        if (g.isMouse && el!.hasPointerCapture(e.pointerId)) {
          el!.releasePointerCapture(e.pointerId);
        }
        snapBack();
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
      el.style.transition = "";
      el.style.transform = "";
      el.style.willChange = "";
    };
  }, []);

  return setRef;
}
