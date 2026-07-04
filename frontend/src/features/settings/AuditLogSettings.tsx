import "./AuditLogSettings.css";
import { useMemo, useState } from "react";
import { useAuditLogState } from "./useAuditLogState";
import type { AuditLogAction } from "@shared/types";

const ACTION_LABELS: Record<AuditLogAction, string> = {
  stars_approved: "Stjärnor godkända",
  reward_purchased: "Köp",
  role_permissions_changed: "Rolländringar"
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("sv-SE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

type Props = {
  enabled: boolean;
};

export function AuditLogSettings({ enabled }: Props) {
  const { items, loading, hasMore, loadMore } = useAuditLogState(enabled);
  const [filter, setFilter] = useState<AuditLogAction | "all">("all");

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((entry) => entry.action === filter)),
    [items, filter]
  );

  if (!enabled) return null;

  return (
    <div className="audit-log-settings">
      <label className="audit-log-settings__filter">
        Filtrera
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as AuditLogAction | "all")}
        >
          <option value="all">Alla händelser</option>
          <option value="stars_approved">{ACTION_LABELS.stars_approved}</option>
          <option value="reward_purchased">{ACTION_LABELS.reward_purchased}</option>
          <option value="role_permissions_changed">{ACTION_LABELS.role_permissions_changed}</option>
        </select>
      </label>

      {filtered.length === 0 && !loading && <p className="empty-note">Inga händelser än.</p>}

      <ul className="audit-log-settings__list">
        {filtered.map((entry) => (
          <li key={entry.id} className="audit-log-settings__row">
            <span className="audit-log-settings__summary">{entry.summary}</span>
            <small className="audit-log-settings__meta">
              {ACTION_LABELS[entry.action]} · {fmtDate(entry.createdAt)}
            </small>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          className="audit-log-settings__load-more"
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? "Laddar…" : "Ladda fler"}
        </button>
      )}
    </div>
  );
}
