import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// trackEvent() använde tidigare en egen rå fetch() utan Authorization-headern —
// /api/analytics/track kräver requireAuth server-side, så anropet fick alltid 401,
// tyst (felet gömdes av en catch()). Zaida upptäckte det i produktionskonsolen.
//
// 2026-07-05: godkännande flyttat från Todos-panelen till Inställningar → Barn
// (en vuxens EGNA uppgifter behöver inte längre godkännande alls) — todon
// tilldelas nu ett riktigt barn, godkänn-klicket (som bara används här som en
// bekväm trigger för att generera en analytics-händelse) sker där istället.

const CHILD_MEMBER = {
  id: "mem-child-1", accountId: "acc-1", userId: null,
  name: "Barnet", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

const DONE_TODO = {
  id: "todo-1", accountId: "acc-1", title: "Duka bordet", createdBy: "mem-1",
  assignedTo: "mem-child-1", isShared: false, status: "done", starValue: 5,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: new Date().toISOString(),
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, expiresAt: null, deletedAt: null, deletedBy: null,
};

test("Analytics-spårning skickar Authorization-headern (fick tidigare alltid 401)", async ({ page }) => {
  let receivedAuthHeader: string | null | undefined;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD_MEMBER] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? [DONE_TODO] : {} })
  );
  await page.route("**/api/analytics/track", (route) => {
    receivedAuthHeader = route.request().headers()["authorization"];
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("region", { name: "Barnens godkännanden" }).getByTitle("Godkänn").click();

  await expect.poll(() => receivedAuthHeader).toBe("Bearer fake-access-token");
});
