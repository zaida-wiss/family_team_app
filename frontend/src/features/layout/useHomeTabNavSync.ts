import { useEffect, useRef, useState } from "react";

export type HomeTab = "calendar" | "shopping" | "todos" | "mealplan" | "members";

const HOME_TABS: readonly HomeTab[] = ["calendar", "shopping", "todos", "mealplan", "members"];
const DEFAULT_TAB: HomeTab = "calendar";

function parseHomeTab(search: string): HomeTab {
  const value = new URLSearchParams(search).get("tab");
  return (HOME_TABS as readonly string[]).includes(value ?? "") ? (value as HomeTab) : DEFAULT_TAB;
}

function buildHomeUrl(tab: HomeTab): string {
  return tab === DEFAULT_TAB ? "/" : `/?tab=${tab}`;
}

// Håller Hem-vyns flikval (Kalender/Inköp/Todos/Måltidsplan/Medlemmar,
// MemberOverview.tsx) synkad med webbläsarens historik (2026-08-29, Zaidas
// önskemål: "när jag uppdaterar sidan skall jag hållas kvar på den vy jag
// är på") — samma URL-per-vy-princip som redan gäller för Inställningars
// kategori/underkategori sedan ADR-0034/useSettingsNavSync.ts, samma
// isFirstRender-mönster (skriver inte till historiken på sin egen första
// render — usePanelUrlSync.ts:s reconciliation i en förälder sätter redan
// "/" när man navigerar till Hem).
//
// Kodad som en ?tab=-query-parameter, INTE en egen path-segment — Hem-
// panelens egen path ("/", se navPaths.ts/usePanelUrlSync.ts) måste förbli
// exakt "/" oavsett vald flik, annars bryts redan existerande test/
// antaganden om att Hem alltid är "/" (t.ex. browser-history-
// navigation.spec.ts). En query-parameter på "/" påverkar aldrig
// pathname-baserad routing (parsePanelPath läser bara pathname).
export function useHomeTabNavSync() {
  const [tab, setTabState] = useState<HomeTab>(() => parseHomeTab(window.location.search));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const target = buildHomeUrl(tab);
    if (target !== window.location.pathname + window.location.search) {
      window.history.pushState({}, "", target);
    }
  }, [tab]);

  useEffect(() => {
    function onPopState() {
      if (window.location.pathname !== "/") return;
      setTabState(parseHomeTab(window.location.search));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return {
    activeTab: tab,
    selectTab(next: HomeTab) {
      setTabState(next);
    }
  };
}
