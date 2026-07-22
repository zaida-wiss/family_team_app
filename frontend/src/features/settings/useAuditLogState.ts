import { useCallback, useEffect, useState } from "react";
import { auditLogApi } from "../../api";
import type { AuditLogEntry } from "@shared/types";

// enabled=false (barn/utan canManageMembers) gör aldrig anropet — komponenten
// monteras numera bara när Aktivitetslogg faktiskt är den valda underkategorin
// (SettingsCategoryNav.tsx, 2026-07-22), men guarden behövs oavsett: en
// medlem utan behörighet ska aldrig anropa endpointen ens om de når hit.
export function useAuditLogState(enabled: boolean) {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    auditLogApi.getPage(page).then((res) => {
      if (cancelled) return;
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
    }).catch(console.error).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [enabled, page]);

  const loadMore = useCallback(() => setPage((p) => p + 1), []);
  const hasMore = total !== null && items.length < total;

  return { items, loading, hasMore, loadMore };
}
