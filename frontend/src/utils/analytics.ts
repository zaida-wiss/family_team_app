import { api, request } from "../api/client";

export type AnalyticsEvent =
  | "todo-completed"
  | "todo-approved"
  | "calendar-event-added"
  | "reward-redeemed"
  | "wish-created"
  | "wish-approved"
  | "login"
  | "shopping-item-checked";

// Använde tidigare en egen rå fetch() utan Authorization-headern — /api/analytics/track
// kräver requireAuth server-side, så anropet fick alltid 401, tyst (felet gömdes av
// catch()en nedan). Går nu via samma request()-hjälpare som resten av appen, som sätter
// headern korrekt. skipUnauthorizedHandler=true — analytics är best-effort och ska
// aldrig visa en felbanner för användaren, bara misslyckas tyst.
export function trackEvent(event: AnalyticsEvent): void {
  request(api("analytics/track"), { method: "POST", body: JSON.stringify({ event }) }, true).catch(() => {
    // Analysfel ska aldrig störa användaren
  });
}
