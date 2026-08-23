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
// **UPPDATERAD 2026-08-23, se nedan** — detta gäller numera bara MUS-
// varianten. Touch fick en riktig, levande vändning.
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
//
// 2026-08-23, uppföljning: "det skall vara som att vända blad i en e-bok."
// Sänkt tröskel/kortare animation (se konstanterna nedan) gjorde svaret
// snabbare, men vändningen spelades ändå bara upp EFTER släpp — ingen
// levande koppling mellan fingrets position och sidans vinkel under
// SJÄLVA draget, vilket inte känns som en riktig e-boks sidvändning (där
// sidan följer fingret pixel för pixel och man SER hur långt man kommit
// innan man släpper). Löst för TOUCH genom att flytta ögonblicksbilden och
// medlemsbytet TIDIGARE — så fort axeln avgörs vågrät (samma punkt där
// everHorizontal redan sattes), inte vid släpp (se beginPeel/updatePeel/
// settlePeel nedan). Rotationen/opaciteten sätts sedan DIREKT (ingen CSS-
// transition) för varje pekar-rörelseevent, proportionellt mot hur stor
// andel av bredden fingret dragit i den låsta riktningen — sidan följer
// alltså fingret exakt. Eftersom medlemmen redan bytts UNDER den
// fortfarande täckande ögonblicksbilden (transform startar på rotateY(0),
// identisk yta) syns bytet aldrig förrän ögonblicksbilden faktiskt roterar
// bort. Släpps fingret innan tröskeln (SWIPE_COMMIT_RATIO) nåtts fjädrar
// sidan tillbaka till platt/odold — och EFTERSOM bytet redan skett måste
// det då ångras (byt tillbaka), men först EFTER att ögonblicksbilden fullt
// återställts (rotateY(0), opacitet 1, alltså fullt övertäckande igen) —
// samma "byt bakom en redan täckande kopia är osynligt"-princip som redan
// användes för det fullbordade svepet. Musens marginal-drag (isMouse) är
// MEDVETET oförändrad, ingen levande spårning där (se uppföljning #6 ovan)
// — bara touch fick den nya, levande vändningen.
const VERTICAL_DOMINANCE_RATIO = 1.5;
// 2026-08-23, Zaida: "jag vill ha snabbare reaktion så att jag inte hinner
// swipa flera gånger i tron om att det nog inte fungerade" — sänkt från 0.5.
// Vid 0.5 krävdes ett drag över HALVA skärmens bredd innan något alls
// hände — ett normalt, snabbt svep som inte når hela vägen gav då noll
// respons och kändes trasigt. 0.3 kräver fortfarande en tydlig, avsiktlig
// rörelse (inte bara några pixlar) men committar vid en realistisk
// swipe-distans. Gäller båda input-typerna.
const SWIPE_COMMIT_RATIO = 0.3;
const AXIS_DECIDE_THRESHOLD_PX = 8;
const DESKTOP_MARGIN_PX = 48;
// 2026-08-23, samma Zaida-fynd: kortad från 260ms för en snabbare, mer
// direkt "sidan vänds"-känsla — halverar samtidigt tiden innan nästa svep
// tillåts (animating-låset). Fungerar nu som REFERENSVÄRDE för en fullt
// spelad vändning (0%→100%) — touch-vändningen (settlePeel) skalar ner
// duration proportionellt mot hur mycket som redan syns/återstår, se
// nedan, så den faktiska speltiden vid släpp oftast är KORTARE än detta.
const FLIP_MS = 180;
// 2026-08-23: golv för settlePeel-animationen (se nedan) — utan ett golv
// skulle ett släpp EXAKT vid tröskeln (progress≈SWIPE_COMMIT_RATIO) eller
// EXAKT vid start (progress≈0) ge en nära nog momentan, ryckig hop-övergång
// istället för en kort men mjuk rörelse.
const MIN_SETTLE_MS = 80;

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

// En pågående, levande sidvändning (touch, 2026-08-23) — se filhuvudet.
type PeelState = {
  snapshot: HTMLElement;
  direction: 1 | -1;
  width: number;
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
  // Touchens levande sidvändning, om en sådan har påbörjats (2026-08-23) —
  // null tills axeln avgörs vågrät. Låser samtidigt axeln till "horizontal"
  // för resten av gesten (se onPointerMove).
  peel: PeelState | null;
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
    // pågående animation och se ryckigt/dubbelt ut. Sätts numera redan när
    // en touch-peel PÅBÖRJAS (2026-08-23), inte bara vid själva
    // avslutningsanimationen — täcker hela den period då medlemmen kan
    // vara "optimistiskt" bytt men ännu inte slutgiltigt bekräftad/ångrad.
    let animating = false;
    // Positioneringskontext för ögonblicksbilden nedan (position:absolute;
    // inset:0 måste positioneras relativt just el, inte en ännu högre
    // förfader) — sätts en gång, permanent, ofarligt för ett i övrigt
    // ostylat wrapper-div.
    el.style.position = "relative";

    // "Sida som vänds"-effekt (2026-08-10, Zaidas fynd: "det blir vitt...
    // jag vill att det ska vara som att vända blad i en bok istället,
    // ingenting vitt"). Den tidigare lösningen lät HELA innehållet (el,
    // en enda nod) glida iväg åt sidan och sedan glida in en ny kopia från
    // andra hållet — eftersom el är den ENDA ytan som täcker utrymmet
    // exponerades skalets egen bakgrund (vit i ljust läge) bakom el under
    // hela den tid den var i rörelse, inte bara ett kort ögonblick.
    //
    // Löst genom att aldrig flytta den RIKTIGA ytan alls: en FRUSEN
    // ÖGONBLICKSBILD (cloneNode) av den nuvarande sidan läggs OVANPÅ
    // (position:absolute, högre z-index) innehållet. Både mus-varianten
    // (commit(), release-styrd) och touch-varianten (beginPeel/updatePeel/
    // settlePeel, 2026-08-23, levande) delar samma ögonblicksbild-uppsättning
    // (createSnapshot).
    function createSnapshot(direction: 1 | -1): HTMLElement {
      const snapshot = el!.cloneNode(true) as HTMLElement;
      // Skärmläsare ska aldrig se den frusna, overksamma dubblettkopian —
      // bara den riktiga, nya sidan under den.
      snapshot.setAttribute("aria-hidden", "true");
      snapshot.style.position = "absolute";
      snapshot.style.inset = "0";
      snapshot.style.zIndex = "1";
      snapshot.style.transformOrigin = direction === 1 ? "left center" : "right center";
      // Bara transform/opacity animeras — båda kompositor-egenskaper som
      // aldrig tvingar en repaint. box-shadow (tidigare försök att antyda
      // djup) provocerade fram en repaint av HELA den nyss klonade,
      // potentiellt stora dashboard-ytan varje bildruta under hela
      // rotationen, rakt emot syftet med snapshot-mönstret.
      snapshot.style.willChange = "transform, opacity";
      snapshot.style.pointerEvents = "none";
      // Rotationen går förbi 90° (till 110°, se nedan) för att sidan ska
      // hinna kännas helt bortvikt innan den tas bort — utan detta hade
      // den sista biten (90°→110°) visat sidans SPEGELVÄNDA baksida
      // istället för att förbli dold.
      snapshot.style.backfaceVisibility = "hidden";

      // Statisk skugga längs kanten som viks bort (2026-08-23, "e-bok"-
      // känslan) — mörknar mot den fria/roterande kanten, som ljuset på
      // ett riktigt pappersblad som lyfts. Ren bakgrundsgradient, ändras
      // aldrig för sig själv (bara HELA ögonblicksbilden roteras/tonas) —
      // ingen extra repaint-kostnad utöver den redan existerande
      // transform/opacity.
      const shadow = document.createElement("div");
      shadow.style.position = "absolute";
      shadow.style.inset = "0";
      shadow.style.pointerEvents = "none";
      shadow.style.background =
        direction === 1
          ? "linear-gradient(to right, transparent 55%, rgba(0,0,0,0.35) 100%)"
          : "linear-gradient(to left, transparent 55%, rgba(0,0,0,0.35) 100%)";
      snapshot.appendChild(shadow);

      el!.appendChild(snapshot);
      return snapshot;
    }

    // MUS-varianten (marginal-drag, release-styrd) — ingen levande
    // spårning under draget (se uppföljning #6), hela vändningen spelas
    // upp EFTER släpp. Touch använder istället beginPeel/updatePeel/
    // settlePeel nedan.
    function commit(dx: number) {
      animating = true;
      const width = el!.getBoundingClientRect().width || 1;
      // Svep åt vänster (nästa medlem) viker sidan bort kring dess VÄNSTRA
      // kant, som att vända framåt i en bok. Svep åt höger (föregående)
      // viker den bort kring den HÖGRA kanten, som att bläddra bakåt.
      const direction: 1 | -1 = dx < 0 ? 1 : -1;
      const snapshot = createSnapshot(direction);

      // Byt medlem — den nya personens innehåll ritas nu UNDER
      // ögonblicksbilden, i samma synkrona task.
      if (dx < 0) onNextRef.current();
      else onPrevRef.current();

      // Dubbel rAF (samma beprövade mönster som redan användes här innan)
      // garanterar att webbläsaren hunnit måla den nya, riktiga sidan under
      // ögonblicksbilden innan viknings-animationen ens börjar.
      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        snapshot.remove();
        animating = false;
      }
      snapshot.addEventListener("transitionend", (e) => {
        if (e.target === snapshot) finish();
      });
      window.setTimeout(finish, FLIP_MS + 150);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          snapshot.style.transition = `transform ${FLIP_MS}ms ease-in, opacity ${FLIP_MS}ms ease-in`;
          snapshot.style.transform = `perspective(${width * 2.5}px) rotateY(${direction * -110}deg)`;
          snapshot.style.opacity = "0.4";
        });
      });
    }

    // Hur stor andel [0,1] av bredden fingret dragit i peel-gestens LÅSTA
    // riktning — negativ/motsatt rörelse (draget "tillbaka") clampas till 0,
    // inte till ett negativt tal, så sidan aldrig viks förbi platt i fel
    // riktning inom samma gest.
    function peelProgress(peel: PeelState, dx: number): number {
      const raw = peel.direction === 1 ? -dx : dx;
      return Math.min(Math.max(raw / peel.width, 0), 1);
    }

    // Påbörjar TOUCH-vändningen så fort axeln avgörs vågrät (2026-08-23) —
    // tidigare (release-styrd) hände detta först vid commit(). Ögonblicks-
    // bilden läggs på UTAN transition (rotateY(0), fullt opak — identisk
    // med den riktiga ytan den täcker) och medlemmen byts DIREKT UNDER den
    // i samma synkrona task, precis som mus-varianten gjorde vid release —
    // bytet är alltså redan osynligt gjort innan draget ens fortsätter.
    function beginPeel(g: GestureState, dx: number) {
      const width = el!.getBoundingClientRect().width || 1;
      const direction: 1 | -1 = dx < 0 ? 1 : -1;
      const snapshot = createSnapshot(direction);
      snapshot.style.transition = "none";
      g.peel = { snapshot, direction, width };
      animating = true;
      if (direction === 1) onNextRef.current();
      else onPrevRef.current();
    }

    // Sätter rotation/opacitet DIREKT (ingen transition) proportionellt mot
    // fingrets aktuella position — anropas varje pointermove medan peelen
    // pågår, ger samma "sidan följer fingret pixel för pixel"-känsla som en
    // riktig e-boksapp.
    function updatePeel(g: GestureState, dx: number) {
      const peel = g.peel;
      if (!peel) return;
      const progress = peelProgress(peel, dx);
      snapshotSetAngle(peel, progress);
    }

    function snapshotSetAngle(peel: PeelState, progress: number) {
      peel.snapshot.style.transform = `perspective(${peel.width * 2.5}px) rotateY(${peel.direction * -110 * progress}deg)`;
      peel.snapshot.style.opacity = String(1 - 0.6 * progress);
    }

    // Avslutar en pågående touch-peel vid släpp/avbrott (2026-08-23) — om
    // draget hunnit förbi SWIPE_COMMIT_RATIO fullbordas vändningen (samma
    // mål-vinkel/opacitet som mus-varianten), annars fjädrar sidan tillbaka
    // till platt/odold. Animationens längd skalas mot hur mycket som
    // FAKTISKT återstår (inte alltid hela FLIP_MS) — har fingret redan
    // dragit 90% av vägen behöver bara de sista 10% animeras, känns
    // omedelbart snarare än att spela om en hel vändning från början.
    function settlePeel(g: GestureState, dx: number) {
      const peel = g.peel!;
      const progress = peelProgress(peel, dx);
      const committed = progress >= SWIPE_COMMIT_RATIO;
      const duration = Math.max(FLIP_MS * (committed ? 1 - progress : progress), MIN_SETTLE_MS);

      peel.snapshot.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
      snapshotSetAngle(peel, committed ? 1 : 0);

      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        if (!committed) {
          // Ögonblicksbilden täcker återigen HELT (rotateY(0), opacitet 1)
          // — bytet som gjordes optimistiskt i beginPeel ångras nu, osynligt
          // bakom den fortfarande fullt täckande kopian, innan den tas bort.
          if (peel.direction === 1) onPrevRef.current();
          else onNextRef.current();
        }
        peel.snapshot.remove();
        animating = false;
      }
      peel.snapshot.addEventListener("transitionend", (e) => {
        if (e.target === peel.snapshot) finish();
      });
      window.setTimeout(finish, duration + 150);
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
        scrollTarget: isMouse ? null : findScrollableAncestor(e.target as Element | null, el!),
        peel: null
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
      // En påbörjad peel LÅSER axeln till vågrät för resten av gesten
      // (2026-08-23) — en sidvändning som redan bytt medlem under
      // ögonblicksbilden ska aldrig plötsligt tolkas om som listskroll
      // mitt i draget.
      if (g.peel) g.axis = "horizontal";

      // 2026-08-10, uppföljning #12 (Zaidas fynd: barnens tre-tryck-gest för
      // att starta todo-timern missade tryck så fort listan inte låg
      // perfekt stilla) — så länge axeln fortfarande är "unknown" (rörelsen
      // ännu under AXIS_DECIDE_THRESHOLD_PX, precis det ett vanligt finger
      // alltid gör under ett tryck) anropas INTE preventDefault(). Att göra
      // det ovillkorligt (som tidigare) stryper webbläsarens syntetiska
      // click-händelse för HELA touchen enligt Pointer Events-specen, även
      // om rörelsen bara var brus från ett tryck — vilket gjorde att
      // ChildTasksSection.tsx/ParentTodoThreadView.tsx:s onClick-baserade
      // tap-räknare (tre-tryck startar timern) tappade tryck. Vi äger ändå
      // touchen helt (.child-dashboard/.child-tasks-grid saknar pan-y i sin
      // touch-action, se filhuvudet) — webbläsaren kan aldrig committa till
      // nativ panorering under de här första pixlarna oavsett.
      if (g.axis === "unknown") return;
      e.preventDefault();

      if (g.axis === "horizontal") {
        g.everHorizontal = true;
        if (!g.peel) beginPeel(g, dx);
        updatePeel(g, dx);
      } else if (g.scrollTarget) {
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

      const dx = e.clientX - g.x;

      // Touch med en påbörjad levande peel (2026-08-23) — avgör själv om
      // vändningen fullbordas eller fjädrar tillbaka, se settlePeel.
      if (g.peel) {
        settlePeel(g, dx);
        return;
      }

      if (!g.everHorizontal) {
        // Aldrig klassad vågrät (rent lodrätt svep, eller för kort rörelse
        // för att avgöras, eller ett musklick som aldrig lämnade
        // marginalen) — ingenting att göra, inget flyttades någonsin.
        return;
      }

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
        if (g.peel) {
          // Gesten avbröts (t.ex. systemgest tar över) mitt i en peel —
          // samma "fjädra tillbaka"-hantering som ett vanligt släpp under
          // tröskeln (2026-08-23), eftersom medlemmen redan hunnit bytas
          // optimistiskt i beginPeel.
          settlePeel(g, e.clientX - g.x);
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
      el.style.position = "";
    };
  }, []);

  return setRef;
}
