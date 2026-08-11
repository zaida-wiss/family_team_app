import { useEffect, useRef, useState } from "react";

type SettingsPath = { categoryId: string | null; subId: string | null };

function parseSettingsPath(pathname: string): SettingsPath {
  const match = pathname.match(/^\/settings(?:\/([^/]+))?(?:\/([^/]+))?\/?$/);
  return { categoryId: match?.[1] ?? null, subId: match?.[2] ?? null };
}

function buildSettingsPath({ categoryId, subId }: SettingsPath): string {
  if (!categoryId) return "/settings";
  return subId ? `/settings/${categoryId}/${subId}` : `/settings/${categoryId}`;
}

// Håller Inställningars kategori/underkategori-navigering synkad med
// webbläsarens historik (2026-08-11, del av samma önskemål som
// usePanelUrlSync.ts). Egen, oberoende historik-nivå EN klick djupare än
// panelbytet till "settings" i sig — SettingsContent.tsx remonteras alltid
// helt vid ett nytt besök i Inställningar (panelNavResetKey, Shell.tsx),
// så den här hooken börjar alltid om från kategori-rutnätet då.
//
// Skriver AVSIKTLIGT inte till historiken på sitt eget FÖRSTA render
// (isFirstRender-vakten) — usePanelUrlSync.ts:s egen reconciliation (som
// körs i en förälder, EFTER denna hooks första körning) ansvarar redan för
// att sätta URL:en till "/settings" när man navigerar dit; skulle den här
// hooken också försöka rätta URL:en på sin första render skulle den vinna
// racet och råka ERSÄTTA (replaceState) föregående panels historik-post
// istället för att panelbytet får en egen ny post.
export function useSettingsNavSync() {
  const [path, setPath] = useState<SettingsPath>(() => parseSettingsPath(window.location.pathname));
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const target = buildSettingsPath(path);
    if (target !== window.location.pathname) {
      window.history.pushState({}, "", target);
    }
  }, [path]);

  useEffect(() => {
    function onPopState() {
      if (!window.location.pathname.startsWith("/settings")) return;
      setPath(parseSettingsPath(window.location.pathname));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return {
    activeCategoryId: path.categoryId,
    activeSubId: path.subId,
    openCategory(categoryId: string, subId: string | null) {
      setPath({ categoryId, subId });
    },
    openSub(subId: string) {
      setPath((p) => ({ categoryId: p.categoryId, subId }));
    },
    backToCategories() {
      setPath({ categoryId: null, subId: null });
    },
    backToSubcategories() {
      setPath((p) => ({ categoryId: p.categoryId, subId: null }));
    }
  };
}
