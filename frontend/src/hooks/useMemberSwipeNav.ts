import { useCallback, useRef } from "react";

// Bläddra mellan familjemedlemmar i barnets dashboard (2026-08-09, Zaidas
// önskemål) — touch: ett enkelt vågrätt svep var som helst i vyn. Mus/
// desktop: nedtryck måste ske i vänster/höger marginal, markören måste
// dras hela vägen över till andra sidan innan man släpper. Bläddringen
// cyklar runt i oändlighet (sista→första, första→sista) via
// goToRelativeMember i MemberShellContent.tsx, inte den här hooken.
//
// 2026-08-09, uppföljning #1–#3 (skärmen rör sig, mus fångades inte,
// osäker gest gav ingen visuell feedback) — se tidigare git-historik för
// full bakgrund. Grunden: pointermove (native addEventListener,
// passive:false) + preventDefault redan under den osäkra perioden +
// translateX-följning satt direkt via DOM (inte React-state).
//
// 2026-08-09, uppföljning #4 (Zaidas fynd: "det går inte att svajpa höger
// eftersom... containern för uppdragskorten flyttar sig istället för att
// det blir ett svep... i allafall i mobilläget") — g.axis LÅSTES
// PERMANENT vid det första utslaget (unknown → horizontal/vertical, en
// gång, aldrig omvärderad). En tumsvep-gest som börjar med ett par pixlars
// lodrät drift (helt normalt beroende på greppets vinkel — vanligare åt
// ETT håll än det andra för de flesta händer) kunde alltså låsas
// "vertical" på de allra första pixlarna, trots att RESTEN av samma gest
// var tydligt vågrät — och satt sedan FAST i det felaktiga låset resten av
// draget, vilket släppte igenom webbläsarens egen (lodräta) panorering på
// vad som upplevdes som en ren sidled-svep. Löst genom att ALDRIG låsa
// permanent — axeln räknas om på VARJE rörelseevent (kumulativt dx/dy från
// gestens start), efter en initial 8px-tröskel som bara skjuter upp
// FÖRSTA beslutet (skyddar mot att övertolka enstaka delpixel-skakningar).
// En gest som startar lodrätt men snabbt blir vågrät tar därmed över
// kontrollen så fort den faktiska riktningen blir tydlig, istället för att
// vara låst av sitt första, missvisande utslag.
//
// 2026-08-09, uppföljning #5 (Zaidas fynd: "jag vill inte se en massa
// vitt, det skall vara som att bläddra i en bok") — den gamla
// bortsveps-animationen slutade med att sätta transform till "" (mitten)
// UTAN någon egen ingångsrörelse för nästa persons redan bytta innehåll —
// det dök bara upp direkt, kantigt, och den korta stund innehållet var
// helt bortskjutet (innan bytet hunnit ske) visade vad som än ligger
// bakom (sidans egen bakgrund). Löst genom att låta nästa persons
// innehåll komma in från MOTSATT håll (samma riktning som en boksida
// skulle vändas åt) istället för att bara dyka upp: när det gamla
// innehållet hunnit ut, sätts det NYA läget till startpositionen
// UTAN övergång (osynlig för ögat, sker inom samma bildruta som bytet)
// och animeras sedan in till sin plats över nästa par bildrutor
// (dubbel requestAnimationFrame — garanterar att webbläsaren hunnit
// registrera startläget innan övergången som för den till 0 börjar, annars
// riskerar de två stilsättningarna att slås ihop till en enda, osynlig
// "övergång" utan rörelse).
const TOUCH_SWIPE_THRESHOLD_PX = 60;
const AXIS_DECIDE_THRESHOLD_PX = 8;
const DESKTOP_MARGIN_PX = 48;
const DESKTOP_CROSS_RATIO = 0.6;
const SNAP_BACK_MS = 200;
const SLIDE_MS = 200;

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
  // Har follow() någonsin kallats den här gesten (2026-08-09, uppföljning
  // #4) — släppet avgörs på DETTA, inte på axelns läge just vid
  // pointerup, eftersom axeln nu kan svänga fram och tillbaka (se ovan);
  // en gest som VARIT vågrät minst en gång ska alltid fjädra tillbaka
  // eller slutföras, aldrig lämnas i ett halvvägs-läge bara för att den
  // sista millisekunden råkade klassas lodrät.
  everHorizontal: boolean;
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
    // Blockerar en NY gest medan förra gestens övergång fortfarande spelar
    // (2026-08-09) — annars kan ett snabbt andra svep starta mitt i en
    // pågående animation och se ryckigt/dubbelt ut.
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
      const enterX = dx < 0 ? width : -width;
      el!.style.transition = `transform ${SLIDE_MS}ms ease-in`;
      el!.style.transform = `translateX(${exitX}px)`;
      window.setTimeout(() => {
        // Byt medlem + placera NÄSTA persons redan-bytta innehåll på
        // ingångspositionen INNAN webbläsaren målar nästa bildruta — allt
        // detta sker synkront inom samma JS-task som setTimeout-callbacken,
        // så webbläsaren hinner aldrig visa en tom bildruta däremellan.
        el!.style.transition = "none";
        el!.style.transform = `translateX(${enterX}px)`;
        if (dx < 0) onNextRef.current();
        else onPrevRef.current();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el!.style.transition = `transform ${SLIDE_MS}ms ease-out`;
            el!.style.transform = "translateX(0px)";
            window.setTimeout(() => {
              el!.style.transition = "";
              el!.style.transform = "";
              animating = false;
            }, SLIDE_MS);
          });
        });
      }, SLIDE_MS);
    }

    function onPointerDown(e: PointerEvent) {
      // Ett spårat svep pågår redan, eller en övergång spelar — ignorera
      // ytterligare fingrar/knappar tills den är klar.
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
      gestureRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        isMouse,
        axis: "unknown",
        everHorizontal: false
      };
    }

    function onPointerMove(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;

      if (g.isMouse) {
        // Redan godkänd att svepa (start i marginalen, pointer capture
        // aktiv) — ingen axel-bedömning behövs, följ bara muspekaren
        // direkt.
        follow(dx);
        g.everHorizontal = true;
        return;
      }

      // Ingen permanent låsning (se filhuvudets uppföljning #4) — räknas om
      // varje rörelseevent utifrån KUMULATIVA dx/dy sedan gestens start.
      // Väntar bara med att göra NÅGOT tills den initiala tröskeln nåtts,
      // för att inte överreagera på enstaka delpixel-skakningar.
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_DECIDE_THRESHOLD_PX) return;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";

      if (g.axis === "horizontal") {
        // Håller webbläsarens egen panorering borta — se filhuvudets
        // uppföljning #3.
        e.preventDefault();
        follow(dx);
        g.everHorizontal = true;
      }
      // g.axis === "vertical": släpper helt (ingen preventDefault, ingen
      // follow()) — vanlig skroll i t.ex. uppgiftslistan fortsätter
      // fungera. Om gesten SENARE svänger vågrät tar grenen ovan över då
      // istället, utan att ha "gett upp" permanent.
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
      } else if (!g.everHorizontal) {
        // Aldrig ens tagit kontroll över gesten (rent lodrätt svep, eller
        // för kort rörelse för att avgöras) — ingen egen visuell
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
        if (g.everHorizontal || g.isMouse) snapBack();
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
