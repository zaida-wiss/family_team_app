import { useCallback, useEffect, useState } from "react";
import { todosApi } from "../../api";
import type { Todo } from "@shared/types";

const PAGE_SIZE = 25;

// Paginerad todos-historik/papperskorg (2026-07-26, Zaidas önskemål: "fixa
// pagineringen på todo") — samma infinite-scroll-mönster som
// useRewardShopState.ts:s köphistorik. Medvetet EGEN, lokal state (inte i
// useTodosState.ts, som äger den mycket känsligare aktiva todo-listan med
// flera samtidiga race-condition-skydd) — TodoHistory.tsx/TrashView.tsx
// mountas alltid färskt när man navigerar dit (SettingsCategoryNav.tsx
// monterar bara den valda underkategorins innehåll), så en enkel
// hämta-vid-mount-räcker utan någon central cache eller
// mutation-invalideringsmekanism.
export function useTodosHistoryState() {
  const [items, setItems] = useState<Todo[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageNum, setPageNum] = useState(1);
  // Ökas för att tvinga en omhämtning från sida 1 (t.ex. efter en permanent
  // tömning av papperskorgen, ADR-0025 — TrashView.tsx:s onPurgeAllTrash
  // rör bara den CENTRALA todos-listan i useTodosState.ts, inte den här
  // lokala, separat hämtade historik-/papperskorgs-sidan).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    todosApi.getHistoryPage(pageNum, PAGE_SIZE).then((res) => {
      if (cancelled) return;
      const newItems = res.items ?? [];
      setItems((prev) => (pageNum === 1 ? newItems : [...prev, ...newItems]));
      setTotal(res.total ?? 0);
    }).catch(console.error).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pageNum, refreshKey]);

  const loadMore = useCallback(() => {
    setPageNum((p) => p + 1);
  }, []);

  const refetch = useCallback(() => {
    setPageNum((current) => {
      if (current === 1) setRefreshKey((k) => k + 1);
      return 1;
    });
  }, []);

  // Optimistisk lokal borttagning (t.ex. TrashView.tsx:s "Återställ" —
  // restoreTodo i useTodosState.ts uppdaterar bara den CENTRALA todos-
  // listan, fire-and-forget, så ett refetch() direkt efter hade racat mot
  // ett anrop som ännu inte hunnit landa på servern).
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
  }, []);

  return { items, total, loading, loadMore, refetch, removeItem };
}
