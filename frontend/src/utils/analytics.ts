const API = import.meta.env.VITE_API_URL ?? "";

export type AnalyticsEvent =
  | "todo-completed"
  | "todo-approved"
  | "calendar-event-added"
  | "reward-redeemed"
  | "wish-created"
  | "wish-approved"
  | "login"
  | "shopping-item-checked";

export function trackEvent(event: AnalyticsEvent): void {
  fetch(`${API}/api/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ event }),
  }).catch(() => {
    // Analysfel ska aldrig störa användaren
  });
}
