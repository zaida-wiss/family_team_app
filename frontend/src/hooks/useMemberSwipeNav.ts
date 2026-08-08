import { useCallback, useRef } from "react";

// Bläddra mellan familjemedlemmar i barnets dashboard (2026-08-09, Zaidas
// önskemål) — touch: ett enkelt vågrätt svep var som helst i vyn. Mus/
// desktop: nedtryck måste ske i vänster/höger marginal, markören måste
// dras hela vägen över till andra sidan innan man släpper. Bläddringen
// cyklar runt i oändlighet (sista→första, första→sista) via
// goToRelativeMember i MemberShellContent.tsx, inte den här hooken.
//
// 2026-08-09, uppföljning #1–#4 (skärmen rör sig, mus fångades inte, osäker
// gest gav ingen visuell feedback, axeln kunde låsas fel permanent) — se
// tidigare git-historik för full bakgrund. Grunden som fortfarande gäller:
// pointermove (native addEventListener, passive:false) + preventDefault,
// axeln räknas om varje rörelseevent (aldrig permanent låst).
//
// 2026-08-09, uppföljning #6 (Zaidas fynd: "tidslinje-vyn... hoppar runt
// när jag drar fingret... vill att den är fast... Annars går det inte att
// 'vända blad' som i en bok") — innehållet FÖLJER ALDRIG fingret levande
// under draget (ingen translateX per rörelseevent). Vid släpp: har draget
// passerat halva bredden (SWIPE_COMMIT_RATIO), spelas en kontrollerad
// sidvändnings-animation (commit()) — annars görs ingenting alls.
//
// 2026-08-09, uppföljning #8/#9 (Zaidas fynd: "man skall kunna dra fingret
// fast i 45 graders vingel och den skall ändå ta det som att man försöker
// svepa") — kräver att den lodräta komponenten är TYDLIGT större än den
// vågräta (VERTICAL_DOMINANCE_RATIO, ~56°) innan gesten alls kan tolkas
// som lodrät, likadant OAVSETT var i vyn den startar (även ovanpå
// uppgiftskorten). Avvägning, medvetet accepterad: en genuint diagonal
// skroll-avsikt i uppgiftslistan kan behöva vara tydligare lodrät än en
// "naiv" 45°-gräns för att räknas som skroll istället för ett svepförsök.
//
// 2026-08-09, uppföljning #11 (Zaidas fynd, samma dag, efter #7/#9/#10:
// "detta händer även lodrät... webbläsarens egen scroll tar över när det
// inte är fixerat... så förfaller svepet") — ROTORSAKEN till HELA den här
// klassen av bugg (vit kant, korten "rör sig", svepet "förfaller"): så
// fort touch-action NÅGONSIN tillåter webbläsaren att själv panorera
// (t.ex. pan-y för lodrät listskroll) kan webbläsaren committa till sin
// EGEN scroll-hantering för en hel touch-sekvens — ett beslut den fattar
// EN GÅNG, tidigt, och sedan ALDRIG lämnar tillbaka till JS, oavsett om
// vår egen axel-bedömning senare (mitt i samma gest) skulle konstatera att
// rörelsen egentligen är vågrät. Att jaga detta med preventDefault() vid
// rätt tidpunkt (#7, #10) minskade fönstret men kunde aldrig stänga det
// helt, eftersom webbläsaren kan hinna före oavsett hur tidigt vi reagerar.
//
// Löst genom att sluta lita på nativ panorering HELT — .child-dashboard/
// .child-tasks-grid har inte längre pan-y i sin touch-action (bara
// pinch-zoom kvar, se ChildDashboard.css/ChildTasks.css — WCAG 1.4.4/
// 1.4.10 kräver att zoom förblir möjlig, det rörs INTE). Utan pan-y kan
// webbläsaren ALDRIG committa till nativ panorering i någon riktning från
// första touch-eventet, deterministiskt, ingen timing inblandad. Vi äger
// därmed HELA gesten själva: preventDefault() anropas nu ovillkorligt på
// varje touch-rörelseevent, och lodrät skroll av uppgiftslistan (om
// pekaren startade där, se findScrollableAncestor) simuleras manuellt
// genom att sätta scrollTop direkt utifrån fingrets STEGVISA (inte
// kumulativa) lodräta rörelse — samma "finger drar, innehåll följer"-
// känsla som nativ scroll, bara implementerad i JS istället för att
// riskera att webbläsaren tar över och aldrig släpper. Ingen momentum/
// studs vid listans ändar (native har det, detta har det inte) — ett
// medvetet, litet avkall mot att svepet äntligen blir 100% pålitligt.
const VERTICAL_DOMINANCE_RATIO = 1.5;
const SWIPE_COMMIT_RATIO = 0.5;
const AXIS_DECIDE_THRESHOLD_PX = 8;
const DESKTOP_MARGIN_PX = 48;
const SLIDE_MS = 200;

// Hittar den NÄRMASTE genuint skrollbara förfadern (overflow-y auto/scroll
// OCH faktiskt mer innehåll än plats) mellan den vidrörda noden och
// gränsen (svep-wrappern) — returnerar själva ELEMENTET (2026-08-09,
// uppföljning #11, var tidigare bara en boolean) så vi kan driva dess
// scrollTop manuellt istället för att förlita oss på nativ panorering.
function findScrollableAncestor(node: Element | null, boundary: Element): Element | null {
  let cur: Element | null = node;
  while (cur && cur !== boundary.parentElement) {
    const style = getComputedStyle(cur);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && cur.scrollHeight > cur.clientHeight) {
      return cur;
    }
    if (cur === boundary) break;
    cur = cur.parentElement;
  }
  return null;
}

type Options = {
  onNext: () => void;
  onPrev: () => void;
};

type GestureState = {
  pointerId: number;
  x: number;
  y: number;
  // Y-koordinaten vid FÖRRA rörelseeventet (2026-08-09, uppföljning #11) —
  // skild från y (gestens STARTposition, används för axel-/tröskel-
  // bedömning) — används för att driva scrollTarget.scrollTop med
  // fingrets stegvisa, inte kumulativa, förflyttning.
  lastY: number;
  isMouse: boolean;
  axis: "unknown" | "horizontal" | "vertical";
  // Har gesten någonsin klassats vågrät (2026-08-09) — avgör vid släpp om
  // svepet ens ska prövas mot tröskeln. Räknas om varje rörelseevent (se
  // ovan), en gest som svänger vågrät tar över kontrollen så fort
  // riktningen blir tydlig.
  everHorizontal: boolean;
  // Den skrollbara listan pekaren startade inuti, om någon (2026-08-09,
  // uppföljning #11) — null om gesten startade utanför all skrollbar yta,
  // då finns inget att driva manuellt oavsett axel.
  scrollTarget: Element | null;
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
        // fysiskt slutar — bara för mus, aldrig touch (skulle annars kapa
        // pekar-events från barn-element som ChildTasksSection.tsx:s
        // håll-in-för-att-avklara).
        el!.setPointerCapture(e.pointerId);
      }
      gestureRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastY: e.clientY,
        isMouse,
        axis: "unknown",
        everHorizontal: false,
        scrollTarget: isMouse ? null : findScrollableAncestor(e.target as Element | null, el!)
      };
    }

    function onPointerMove(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;

      if (g.isMouse) {
        // Redan godkänd att svepa (start i marginalen, pointer capture
        // aktiv) — alltid vågrätt, ingen axel-bedömning behövs. Ingen
        // levande följning (se filhuvudets uppföljning #6) — bara
        // markera att gesten är giltig, sidvändningen sker vid släpp.
        g.everHorizontal = true;
        return;
      }

      // Vi äger touchen helt (2026-08-09, uppföljning #11) — .child-
      // dashboard/.child-tasks-grid saknar numera pan-y i sin touch-action,
      // så webbläsaren kan aldrig committa till nativ panorering ändå.
      // preventDefault() här är därmed mest en extra säkerhetsåtgärd (och
      // krav för att en del webbläsare ska räkna touchen som "hanterad"),
      // den huvudsakliga spärren sitter i CSS:en.
      e.preventDefault();

      // Fingrets STEGVISA lodräta förflyttning sedan FÖRRA eventet (inte
      // sedan gestens start) — uppdateras varje event oavsett axel, så att
      // en manuell scroll som börjar SENARE (när axeln väl slår fast
      // "vertical") aldrig får ett hopp för den redan förflutna, oanvända
      // sträckan.
      const stepDeltaY = e.clientY - g.lastY;
      g.lastY = e.clientY;

      // Ingen permanent låsning — räknas om varje rörelseevent utifrån
      // KUMULATIVA dx/dy sedan gestens start. Väntar bara med att
      // FASTSTÄLLA axeln tills den initiala tröskeln nåtts, för att inte
      // överreagera på enstaka delpixel-skakningar. Samma generösa kvot
      // oavsett var gesten startade (se uppföljning #9) — svepet ska
      // dominera överallt.
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= AXIS_DECIDE_THRESHOLD_PX) {
        g.axis = Math.abs(dy) > Math.abs(dx) * VERTICAL_DOMINANCE_RATIO ? "vertical" : "horizontal";
      }

      if (g.axis === "horizontal") {
        g.everHorizontal = true;
      } else if (g.axis === "vertical" && g.scrollTarget) {
        // Manuell "nativ känns"-scroll (2026-08-09, uppföljning #11) —
        // ersätter den nativa panorering vi medvetet stängt av i CSS:en.
        g.scrollTarget.scrollTop -= stepDeltaY;
      }
    }

    function onPointerUp(e: PointerEvent) {
      const g = gestureRef.current;
      if (!g || g.pointerId !== e.pointerId) return;
      gestureRef.current = null;
      if (g.isMouse && el!.hasPointerCapture(e.pointerId)) {
        el!.releasePointerCapture(e.pointerId);
      }

      if (!g.everHorizontal) {
        // Aldrig klassad vågrät (rent lodrätt svep, eller för kort rörelse
        // för att avgöras, eller ett musklick som aldrig lämnade
        // marginalen) — ingenting att göra, inget flyttades någonsin.
        return;
      }

      const dx = e.clientX - g.x;
      // Samma andels-tröskel för båda input-typerna — kräver en stor andel
      // av bredden, inte bara några pixlar, så t.ex. en vanlig
      // textmarkering med musen aldrig räknas som en växling.
      const width = el!.getBoundingClientRect().width || 1;
      if (Math.abs(dx) < width * SWIPE_COMMIT_RATIO) return;

      // Svep/dra åt vänster = nästa medlem, åt höger = föregående — samma
      // riktningskonvention som ett bildspel/karusell.
      commit(dx);
    }

    function onPointerCancel(e: PointerEvent) {
      const g = gestureRef.current;
      if (g?.pointerId === e.pointerId) {
        gestureRef.current = null;
        if (g.isMouse && el!.hasPointerCapture(e.pointerId)) {
          el!.releasePointerCapture(e.pointerId);
        }
        // Inget att fjädra tillbaka (se filhuvudets uppföljning #6) —
        // innehållet flyttades aldrig under draget.
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
