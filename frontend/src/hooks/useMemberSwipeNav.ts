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
// pointermove (native addEventListener, passive:false) + preventDefault
// redan under den osäkra perioden, axeln räknas om varje rörelseevent
// (aldrig permanent låst).
//
// 2026-08-09, uppföljning #6 (Zaidas fynd: "tidslinje-vyn... hoppar runt
// när jag drar fingret. Jag vill att den är fast när jag rör fingret där.
// Annars går det inte att 'vända blad' som i en bok") — uppföljning #5
// (och innan dess, hela "lika lätt som Tinder"-omskrivningen) byggde på
// att INNEHÅLLET FÖLJER FINGRET LEVANDE under hela draget (translateX satt
// på VARJE rörelseevent). Det visade sig vara fel gest för vad Zaida
// faktiskt vill ha: en boksida ligger stilla ända tills den vänds, den
// "följer" inte fingret kontinuerligt dessförinnan. follow()/snapBack()
// (den levande 1:1-följningen och dess återfjädring) borttagna helt —
// innehållet rör sig INTE alls under draget. Axel-detekteringen (för att
// skilja ett vågrätt svep från vanlig lodrät skroll, och hindra
// webbläsarens egen panorering under tiden) är oförändrad och behövs
// fortfarande. Vid släpp: har draget passerat halva bredden (samma
// SWIPE_COMMIT_RATIO som innan), spelas EXAKT samma kontrollerade
// sidvändnings-animation (commit(), oförändrad) som redan fanns för ett
// fullbordat svep — annars görs ingenting alls (inget att fjädra tillbaka,
// eftersom inget någonsin flyttades).
// 2026-08-09, uppföljning #7 (Zaidas fynd: "hela containern med allt
// innehåll rör sig även upp och ner med fingret... det försör känslan
// väldigt mycket när man ser en vit kant") — g.axis==="vertical"-grenen
// kallade MEDVETET aldrig preventDefault, för att inte förstöra vanlig
// skroll i uppgiftslistan (.child-tasks-grid). Problemet: samma
// eftergivenhet gällde ALLA lodräta rörelser, även de som börjar på
// tidslinjen/hjälten/bakgrunden — ytor som INTE är skrollbara
// (.child-dashboard har overflow:hidden). En sådan lodrät rörelse har
// ingenting legitimt att skrolla LOKALT, men webbläsaren försöker ändå
// hitta någon skrollbar förfader — och utan en dokument-nivå-spärr (en
// tidigare sådan togs bort igen, se historiken, då den av andra skäl
// klippte position:fixed-element som medlemslistans popup) läcker det
// till <body>s elastiska studs, vilket syns som en vit kant. Löst genom
// att avgöra REDAN vid nedtryck om pekaren startade INUTI en genuint
// skrollbar yta (findScrollableAncestor) — startar den UTANFÖR hålls
// webbläsarens egen hantering ALLTID borta (oavsett axel), eftersom det
// då aldrig finns något legitimt att skrolla där ändå.
// 2026-08-09, uppföljning #8 (Zaidas fynd: "svajpar jag från vänster till
// höger och inte spikrakt så flyttar sig dashboarden bara upp och ner...
// man skall kunna dra fingret fast i 45 graders vingel och den skall ändå
// ta det som att man försöker svepa till en annan medlem") — den strikta
// |dx|>|dy|-jämförelsen ÄR redan matematiskt exakt gränsen vid 45°, men vid
// EXAKT eller strax över 45° (helt normalt för en verklig fingerrörelse,
// särskilt över en lite längre sträcka) klassades gesten som lodrät och
// gav upp helt. Kräver nu att den lodräta komponenten är TYDLIGT större än
// den vågräta (en högre kvot, motsvarande ~56°) innan gesten ger upp och
// lämnas åt webbläsaren — annars vinner alltid tolkningen "försöker svepa".
//
// 2026-08-09, uppföljning #9 (Zaidas fynd, samma dag: "svajpar jag från
// höger så flyttas uppgiftscorten (containern) åt vänster istället för att
// bläddra... [45°-kravet gäller] Man skall kunna dra fingret fast i 45
// graders vingel" — utan undantag) — den generösa kvoten gällde tidigare
// BARA utanför en skrollbar yta (uppgiftslistan behöll den strikta 45°-
// gränsen, för att inte göra vanlig lodrät listskroll opålitlig). Men ett
// svep som råkar starta OVANPÅ uppgiftskorten (vanligt, de fyller stora
// delar av skärmen) klassades då fortfarande lätt som lodrätt vid minsta
// diagonal drift, gav upp, och släpptes till listans egen (native)
// lodräta panorering — vilket kunde SE UT som att korten/behållaren rör
// sig. Zaida bekräftade uttryckligen att svepet ska dominera ÖVERALLT,
// inte bara utanför listan — kvoten gäller nu likadant oavsett var gesten
// startar. Avvägning, medvetet accepterad: en genuint diagonal
// skroll-avsikt i uppgiftslistan kan nu behöva vara tydligare lodrät än
// innan för att räknas som skroll istället för ett svepförsök.
//
// 2026-08-09, uppföljning #10 (Zaidas fynd, samma dag: "Det går inte att
// svajpa när det jag ska svajpa på rör på sig! Det behöver vara
// fixerat!") — kvarvarande hål trots #9 och trots att .child-dashboard
// (ChildDashboard.css) samma dag fick touch-action: pan-y pinch-zoom.
// Enskilda uppgiftskort har sitt EGET touch-action:none (oförändrat,
// krävs för håll-in/tre-tryck-gesterna) och är därmed redan immuna mot
// nativ panorering — men grid-MELLANRUMMET runt korten (.child-tasks-grid
// själv sätter aldrig egen touch-action, ärver bara pan-y pinch-zoom från
// .child-dashboard) har INGET sådant skydd. touch-action:s använda värde
// låses av webbläsaren VID TOUCHSTART utifrån elementet direkt under
// fingret — träffar ett svep av misstag mellanrummet istället för själva
// kortet (helt normalt, fingrar är inte pixelexakta) låstes den touchen
// till pan-y pinch-zoom för HELA gestens duration, och om de allra första
// rörelsemillimetrarna råkade ha en tillräckligt lodrät komponent (vanligt
// för en mänsklig fingerrörelse, långt innan vår egen 8px-tröskel ens
// hunnit avgöra något) kunde webbläsaren committa till nativ lodrät scroll
// FÖRE vår axel-bedömning ens kört en gång — ett rent timing-race vi
// tidigare inte skyddade oss mot under den OSÄKRA perioden (axis==
// "unknown"). Fixat: preventDefault() anropas nu ÄVEN under den osäkra
// perioden när insideScrollable är sant (inte bara efter att axeln
// konkret slagits fast som vågrät) — håller webbläsaren borta tills
// axeln antingen blir "horizontal" (svepet tar över helt) eller
// definitivt "vertical" (bara då släpps native scroll fram). Kostar högst
// AXIS_DECIDE_THRESHOLD_PX (8px) extra latens innan en genuin lodrät
// skroll får starta — ett medvetet accepterat, i praktiken omärkbart pris.
const VERTICAL_DOMINANCE_RATIO = 1.5;
const SWIPE_COMMIT_RATIO = 0.5;
const AXIS_DECIDE_THRESHOLD_PX = 8;
const DESKTOP_MARGIN_PX = 48;
const SLIDE_MS = 200;

function findScrollableAncestor(node: Element | null, boundary: Element): boolean {
  let cur: Element | null = node;
  while (cur && cur !== boundary.parentElement) {
    const style = getComputedStyle(cur);
    if ((style.overflowY === "auto" || style.overflowY === "scroll") && cur.scrollHeight > cur.clientHeight) {
      return true;
    }
    if (cur === boundary) break;
    cur = cur.parentElement;
  }
  return false;
}

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
  // Har gesten någonsin klassats vågrät (2026-08-09) — avgör vid släpp om
  // svepet ens ska prövas mot tröskeln. Räknas om varje rörelseevent (se
  // ovan), en gest som svänger vågrät tar över kontrollen så fort
  // riktningen blir tydlig.
  everHorizontal: boolean;
  // Startade pekaren inuti en genuint skrollbar yta (2026-08-09,
  // uppföljning #7) — avgörs en gång vid nedtryck, styr om lodräta
  // rörelser får lämnas åt webbläsaren eller alltid ska hindras.
  insideScrollable: boolean;
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
        isMouse,
        axis: "unknown",
        everHorizontal: false,
        insideScrollable: isMouse ? false : findScrollableAncestor(e.target as Element | null, el!)
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

      // Startade UTANFÖR en skrollbar yta (2026-08-09, uppföljning #7) —
      // det finns då aldrig något legitimt att skrolla lokalt, håll
      // webbläsarens egen hantering borta oavsett axel, annars läcker
      // rörelsen till dokumentets elastiska studs (en vit kant syns).
      if (!g.insideScrollable) {
        e.preventDefault();
      }

      // Ingen permanent låsning — räknas om varje rörelseevent utifrån
      // KUMULATIVA dx/dy sedan gestens start. Väntar bara med att FASTSTÄLLA
      // axeln tills den initiala tröskeln nåtts, för att inte överreagera på
      // enstaka delpixel-skakningar. Samma generösa kvot oavsett var gesten
      // startade (se uppföljning #9) — svepet ska dominera överallt.
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= AXIS_DECIDE_THRESHOLD_PX) {
        g.axis = Math.abs(dy) > Math.abs(dx) * VERTICAL_DOMINANCE_RATIO ? "vertical" : "horizontal";
      }

      if (g.axis === "horizontal") {
        // Håller webbläsarens egen panorering borta (om inte redan gjort
        // ovan) — annars stjäl den gesten innan vi hinner avgöra att den
        // är vågrät. Ingen egen rörelse appliceras (se filhuvudets
        // uppföljning #6) — innehållet ligger stilla under HELA draget,
        // sidvändningen sker bara vid släpp om tröskeln passerats.
        e.preventDefault();
        g.everHorizontal = true;
      } else if (g.axis === "unknown" && g.insideScrollable) {
        // 2026-08-09, uppföljning #10 — håll webbläsaren borta redan under
        // den OSÄKRA perioden också (inte bara efter att axeln konkret
        // slagits fast som vågrät). Utan detta kunde en gest som startade i
        // grid-mellanrummet mellan korten (touch-action:none finns bara PÅ
        // själva korten, inte i mellanrummet) committa till nativ lodrät
        // scroll innan vår 8px-tröskel ens hunnit avgöra något — se
        // filhuvudets uppföljning #10 för fullständig förklaring.
        e.preventDefault();
      }
      // g.axis === "vertical" OCH insideScrollable: släpper helt (ingen
      // preventDefault) — vanlig skroll i uppgiftslistan fortsätter
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
