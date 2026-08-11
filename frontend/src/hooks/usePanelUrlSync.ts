import { useEffect, useRef } from "react";
import { buildPanelPath, parsePanelPath } from "../utils/navPaths";
import type { AppPanel, Id } from "@shared/types";

// Kopplar activePanel/selectedDashboardMemberId till webbläsarens historik
// (2026-08-11, Zaidas önskemål: "om jag i webbläsaren vill backa eller gå
// framåt så vill jag att det ska fungera") — varje panelbyte/medlemsval
// blir en egen historik-post, så bakåt/framåt-knapparna växlar mellan
// senast visade vyer istället för att lämna appen (ingen router fanns
// tidigare, se navPaths.ts).
//
// mountedRef skiljer den ALLRA FÖRSTA reconciliationen (t.ex. en
// sidladdning på "/" som återställer en persisterad lastActivePanel till
// "/kalender") från alla senare byten — den första använder replaceState
// (rättar adressfältet utan att skapa en falsk historik-post man sedan
// måste backa förbi), alla efterföljande använder pushState (en riktig ny
// historik-post per vybyte).
export function usePanelUrlSync(
  activePanel: AppPanel,
  selectedDashboardMemberId: Id | null,
  setActivePanel: (panel: AppPanel) => void,
  setSelectedDashboardMemberId: (id: Id | null) => void
) {
  const mountedRef = useRef(false);

  useEffect(() => {
    const path = buildPanelPath({ panel: activePanel, memberId: selectedDashboardMemberId });
    if (path !== window.location.pathname) {
      if (mountedRef.current) {
        window.history.pushState({}, "", path);
      } else {
        window.history.replaceState({}, "", path);
      }
    }
    mountedRef.current = true;
  }, [activePanel, selectedDashboardMemberId]);

  useEffect(() => {
    function onPopState() {
      // "/" särbehandlas HÄR (till skillnad från parsePanelPath, se
      // navPaths.ts) — vid en bakåt/framåt-tryckning är "/" alltid en
      // riktig historik-post (skapad av antingen sidladdningen eller ett
      // tidigare pushState("/") vid ett Hem-klick), så den ska alltid
      // tolkas som Hem. Bara den ALLRA FÖRSTA initial-state-läsningen (ovan)
      // ska behandla "/" som "ospecificerad, återställ senast aktiva panel".
      const pathname = window.location.pathname;
      const target = pathname === "/" ? { panel: "home" as const, memberId: null } : parsePanelPath(pathname);
      if (!target) return;
      if (target.panel !== activePanel) {
        setActivePanel(target.panel);
      }
      if (target.panel === "members" && target.memberId !== selectedDashboardMemberId) {
        setSelectedDashboardMemberId(target.memberId);
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [activePanel, selectedDashboardMemberId, setActivePanel, setSelectedDashboardMemberId]);
}
