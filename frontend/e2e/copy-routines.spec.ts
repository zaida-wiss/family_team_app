import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Kopiera rutiner mellan barn (2026-07-15, Zaidas önskemål: "kryssa i alla
// rutiner som ett nytt barn skall få från de befintliga barnens rutiner")
// — annars måste varje rutin öppnas och redigeras en och en för att lägga
// till ett nytt barn som mottagare.

const CHILD_A = {
  id: "mem-child-a", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

const CHILD_B = {
  id: "mem-child-b", accountId: "acc-1", userId: null,
  name: "Leo", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

const ROUTINE = {
  id: "routine-1", accountId: "acc-1", title: "Borsta tänderna", createdBy: "mem-1",
  assignedTo: "mem-child-a", isShared: false, status: "pending", starValue: 2,
  visual: { type: "lucide-icon", value: "Sparkles" },
  recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: ["monday", "tuesday"] },
  recurringSourceId: null, occurrenceDate: null,
  visibleFrom: "2026-06-01T07:00:00.000Z", expiresAt: "2026-06-01T08:00:00.000Z",
  completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};

async function openBarnSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
}

test("Kopiera rutiner: skapar en kopia av källbarnets rutin åt mottagaren", async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_A, CHILD_B] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "POST") {
      createdBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fulfill({ json: [ROUTINE] });
  });

  await openBarnSettings(page);
  await page.getByRole("button", { name: "Kopiera rutiner från ett annat barn" }).click();

  const dialog = page.getByRole("dialog", { name: "Kopiera rutiner" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Kopiera från").selectOption({ label: "Nova" });
  await dialog.getByLabel("Till").selectOption({ label: "Leo" });

  await expect(dialog.getByText("Borsta tänderna")).toBeVisible();
  await dialog.getByLabel(/Välj alla/).check();

  await dialog.getByRole("button", { name: /Kopiera \(1\)/ }).click();

  await expect.poll(() => createdBody).not.toBeNull();
  expect(createdBody!.title).toBe("Borsta tänderna");
  expect(createdBody!.assignedTo).toBe("mem-child-b");
  expect(createdBody!.starValue).toBe(2);
  expect(createdBody!.status).toBe("pending");
  expect(createdBody!.completedAt).toBeNull();
  expect(dialog).not.toBeVisible();
});

test("Kopiera rutiner: visar bara rutiner mottagaren ännu saknar", async ({ page }) => {
  const SHARED_ROUTINE = { ...ROUTINE, id: "routine-shared", assignedTo: "mem-child-a" };
  const ALREADY_HAS = { ...ROUTINE, id: "routine-both-a", assignedTo: "mem-child-a", title: "Redan hos båda" };
  const ALREADY_HAS_B = { ...ALREADY_HAS, id: "routine-both-b", assignedTo: "mem-child-b" };

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_A, CHILD_B] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: [SHARED_ROUTINE, ALREADY_HAS, ALREADY_HAS_B] })
  );

  await openBarnSettings(page);
  await page.getByRole("button", { name: "Kopiera rutiner från ett annat barn" }).click();

  const dialog = page.getByRole("dialog", { name: "Kopiera rutiner" });
  await dialog.getByLabel("Kopiera från").selectOption({ label: "Nova" });
  await dialog.getByLabel("Till").selectOption({ label: "Leo" });

  await expect(dialog.getByText("Borsta tänderna")).toBeVisible();
  await expect(dialog.getByText("Redan hos båda")).toHaveCount(0);
});
