import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Zaida rapporterade 2026-07-04: en godkänd todo försvinner (korrekt, flyttas till
// historik) men "kommer sedan tillbaka". Grundorsak: refreshTodos() triggas från
// fyra oberoende källor (mount/SSE/visibilitychange/30s-intervall). Om en av dem
// hinner svara med en server-snapshot från INNAN godkänn-anropet landat, skriver
// den över den optimistiska uppdateringen — todon "studsar tillbaka" till väntande
// tills nästa refresh rättar till det igen. Redan diagnostiserad i backloggen (S7),
// fixad här: todo-id med en pågående mutation skyddas mot att skrivas över av en
// ANNAN, oberoende refresh tills mutationen själv bekräftat resultatet.

const DONE_TODO = {
  id: "todo-1",
  accountId: "acc-1",
  title: "Duka bordet",
  createdBy: "mem-1",
  assignedTo: "mem-1",
  isShared: false,
  starValue: 5,
  visual: { type: "lucide-icon", value: "Star" },
  recurrence: { type: "none" },
  completedAt: new Date().toISOString(),
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectedReason: null,
  expiresAt: null,
  recurringSourceId: null,
  occurrenceDate: null,
  deletedAt: null,
  deletedBy: null,
};

test("Godkänd todo förblir godkänd även om en oberoende bakgrundsrefresh svarar med gammal data mitt i", async ({ page }) => {
  let approvedOnServer = false;

  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [{ ...DONE_TODO, status: approvedOnServer ? "approved" : "done" }],
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-1/approve", async (route) => {
    // Simulerar ett långsamt serveranrop — ger ett tidsfönster där en ANNAN,
    // oberoende refresh (här: visibilitychange) hinner svara med gammal data.
    await new Promise((resolve) => setTimeout(resolve, 400));
    approvedOnServer = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const approvalPanel = page.getByRole("region", { name: "Uppgifter att godkänna" });
  await expect(approvalPanel.getByText("Duka bordet")).toBeVisible();

  await approvalPanel.getByTitle("Godkänn").click();
  // Optimistisk uppdatering — uppgiften ska genast lämna godkänn-listan.
  await expect(approvalPanel.getByText("Duka bordet")).toHaveCount(0);

  // Trigga en oberoende bakgrundsrefresh MEDAN godkänn-anropet fortfarande
  // pågår (approvedOnServer är fortfarande false på servern just nu).
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  // Viktigt: en vanlig auto-retrying expect().toHaveCount() skulle missa buggen
  // här — den polling:ar tills den lyckas (upp till 5s), och buggen är bara
  // transient (rättas till efter 400ms av mutationens egen avslutande refresh).
  // En engångskontroll mitt i race-fönstret krävs för att fånga den.
  await page.waitForTimeout(100);
  const countDuringRace = await approvalPanel.getByText("Duka bordet").count();
  expect(countDuringRace).toBe(0);

  // Vänta ut det långsamma godkänn-anropet och dess egna avslutande refresh.
  await page.waitForTimeout(600);
  await expect(approvalPanel.getByText("Duka bordet")).toHaveCount(0);
});
