import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Dela en EGEN kategori med en annan familj, icke-transitivt (2026-08-06,
// Zaidas önskemål: "det skall vara möjligt att dela sina egna kategorier
// med utvalda familjer") — samma tvådelade mönster som
// shopping-external-sharing.spec.ts (ADR-0026): (1) kategorimenyns "Dela":
// sök en vuxen via e-post, ge access, se delningen, återkalla den.
// (2) Hem-vyns Todos-flik: en tråd per kategori NÅGON ANNAN delat med mig.

const CATEGORY = {
  id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Träning",
  createdAt: "2024-01-01T00:00:00.000Z", externalSharedWith: [], deletedAt: null, deletedBy: null
};

const PERSONAL_TODO = {
  id: "todo-1", accountId: "acc-1", title: "Löpning", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: "cat-1"
};

test("Kategorimenyns 'Dela': söker en vuxen via e-post, ger åtkomst, ser delningen, återkallar den", async ({ page }) => {
  let shares: Record<string, unknown>[] = [];
  let shareBody: Record<string, unknown> | null = null;
  let revoked = false;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [PERSONAL_TODO] }));

  await page.route("**/api/todo-categories/*/external-share/lookup", (route) => {
    const body = route.request().postDataJSON();
    if (body.email === "annan-familj@exempel.se") {
      return route.fulfill({
        json: {
          memberships: [
            { memberId: "mem-other", accountId: "acc-2", memberName: "Erik", accountName: "Familjen Andersson" }
          ]
        }
      });
    }
    return route.fulfill({ json: { memberships: [] } });
  });

  await page.route("**/api/todo-categories/*/external-share", (route) => {
    if (route.request().method() === "POST") {
      shareBody = route.request().postDataJSON();
      shares = [
        {
          memberId: "mem-other", accountId: "acc-2", access: shareBody!.access,
          grantedBy: "mem-1", grantedAt: "2026-08-06T10:00:00.000Z"
        }
      ];
      return route.fulfill({ status: 201, json: shares });
    }
    return route.fulfill({ json: shares });
  });

  await page.route("**/api/todo-categories/*/external-share/*/*", (route) => {
    revoked = true;
    shares = [];
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: /Träning/ }).click();
  await page.getByRole("button", { name: "Dela", exact: true }).click();

  await page.getByLabel("E-post till en vuxen").fill("annan-familj@exempel.se");
  await page.getByRole("button", { name: "Sök" }).click();

  const candidateRow = page.getByText("Erik (Familjen Andersson)").locator("..");
  await expect(candidateRow).toBeVisible();
  await page.getByLabel("Åtkomst").selectOption("edit");
  await candidateRow.getByRole("button", { name: "Dela", exact: true }).click();

  await expect.poll(() => shareBody).not.toBeNull();
  expect(shareBody!.granteeMemberId).toBe("mem-other");
  expect(shareBody!.granteeAccountId).toBe("acc-2");
  expect(shareBody!.access).toBe("edit");

  await expect(page.getByText("Kan redigera")).toBeVisible();

  await page.getByRole("button", { name: "Ta bort delning" }).click();
  await expect.poll(() => revoked).toBe(true);
  await expect(page.getByText("Kan redigera")).not.toBeVisible();
});

test("Hem-vyns Todos-flik: en kategori delad med mig visas som en egen tråd, klarmarkering anropar shared-categories-endpointen", async ({ page }) => {
  let completedBody: { elapsedMs: number | null } | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todos/shared-categories", (route) =>
    route.fulfill({
      json: [
        {
          category: { id: "cat-other-1", accountId: "acc-2", name: "Packlista", accountName: "Familjen Andersson" },
          access: "edit",
          todos: [
            {
              ...PERSONAL_TODO,
              id: "todo-shared-1",
              accountId: "acc-2",
              title: "Packa badkläder",
              personalCategoryId: "cat-other-1"
            }
          ]
        }
      ]
    })
  );
  await page.route("**/api/todos/shared-categories/acc-2/todo-shared-1/complete", (route) => {
    completedBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await expect(page.getByText("Packlista (Familjen Andersson)")).toBeVisible();
  const ball = page.getByRole("button", { name: /Packa badkläder/ });
  await expect(ball).toBeVisible();

  // Samma dispatchEvent-teknik som parent-todo-thread-view.spec.ts:s
  // långtrycks-test — page.mouse hit-testar en OS-markörposition mot
  // sidans layout, ett litet layoutskifte räcker för att trigga
  // pointerleave i förtid (testmiljö-artefakt, inte relaterat till gesten).
  await ball.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });

  await expect.poll(() => completedBody).not.toBeNull();
});

test("otillräcklig behörighet: 'Dela' visas inte för Barn-tråden (ingen riktig kategori)", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/members", (route) =>
    route.fulfill({ json: [{ ...MEMBER, showChildTodosInOwnView: true }] })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: /Barn/ }).click();
  await expect(page.getByRole("button", { name: "Dela", exact: true })).not.toBeVisible();
});
