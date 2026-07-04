import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// trackEvent() använde tidigare en egen rå fetch() utan Authorization-headern —
// /api/analytics/track kräver requireAuth server-side, så anropet fick alltid 401,
// tyst (felet gömdes av en catch()). Zaida upptäckte det i produktionskonsolen.

const DONE_TODO = {
  id: "todo-1", accountId: "acc-1", title: "Duka bordet", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "done", starValue: 5,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: new Date().toISOString(),
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, expiresAt: null, deletedAt: null, deletedBy: null,
};

test("Analytics-spårning skickar Authorization-headern (fick tidigare alltid 401)", async ({ page }) => {
  let receivedAuthHeader: string | null | undefined;

  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? [DONE_TODO] : {} })
  );
  await page.route("**/api/analytics/track", (route) => {
    receivedAuthHeader = route.request().headers()["authorization"];
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByRole("region", { name: "Uppgifter att godkänna" }).getByTitle("Godkänn").click();

  await expect.poll(() => receivedAuthHeader).toBe("Bearer fake-access-token");
});
