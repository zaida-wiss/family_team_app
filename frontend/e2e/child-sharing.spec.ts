import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22, Zaidas beslut: "separerade föräldrar utan god relation ändå
// skall kunna dela information om ett gemensamt barn"). Två flöden testas:
// (1) Inställningar → Barn → Barnkonton → "Dela barn": sök en vuxen via
// e-post, ge access, se delningen i listan, återkalla den. (2) Todos-panelen
// (tråd-vyn): en "Delade barn"-tråd visas för barn NÅGON ANNAN delat med
// mig, med ett låst (endast visning) läge när access är "view".

const CHILD_A = {
  id: "mem-child-a", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

async function openBarnkonton(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "Barnkonton" }).click();
}

test("Dela barn: söker en vuxen via e-post, ger åtkomst, ser delningen, återkallar den", async ({ page }) => {
  let shares: Record<string, unknown>[] = [];
  let shareBody: Record<string, unknown> | null = null;
  let revoked = false;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_A] }));

  await page.route("**/api/members/*/share/lookup", (route) => {
    const body = route.request().postDataJSON();
    if (body.email === "annan-foralder@exempel.se") {
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

  await page.route("**/api/members/*/share", (route) => {
    if (route.request().method() === "POST") {
      shareBody = route.request().postDataJSON();
      shares = [
        {
          memberId: "mem-other", accountId: "acc-2", access: shareBody!.access,
          grantedBy: "mem-1", grantedAt: "2026-07-22T10:00:00.000Z"
        }
      ];
      return route.fulfill({ status: 201, json: shares });
    }
    return route.fulfill({ json: shares });
  });

  await page.route("**/api/members/*/share/*/*", (route) => {
    revoked = true;
    shares = [];
    return route.fulfill({ json: { ok: true } });
  });

  await openBarnkonton(page);

  await page.getByLabel("E-post till en vuxen").fill("annan-foralder@exempel.se");
  await page.getByRole("button", { name: "Sök" }).click();

  await expect(page.getByText("Erik (Familjen Andersson)")).toBeVisible();
  await page.getByLabel("Åtkomst").selectOption("edit");
  await page.getByRole("button", { name: "Dela" }).click();

  await expect.poll(() => shareBody).not.toBeNull();
  expect(shareBody!.granteeMemberId).toBe("mem-other");
  expect(shareBody!.granteeAccountId).toBe("acc-2");
  expect(shareBody!.access).toBe("edit");

  await expect(page.getByText("Kan redigera")).toBeVisible();

  await page.getByRole("button", { name: "Ta bort delning" }).click();
  await expect.poll(() => revoked).toBe(true);
  await expect(page.getByText("Kan redigera")).not.toBeVisible();
});

test("Todos-panelen: en delad barn-tråd visas med visnings-läge när access är 'view'", async ({ page }) => {
  const SHARED_TODO = {
    id: "todo-shared-1", accountId: "acc-2", title: "Läxor", createdBy: "mem-other-parent",
    assignedTo: "mem-other-child", isShared: false, status: "pending", starValue: 3,
    visual: { type: "lucide-icon", value: "BookOpen" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null,
    visibleFrom: null, expiresAt: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };

  await mockAuthAndData(page);
  await page.route("**/api/todos/shared-children", (route) =>
    route.fulfill({
      json: [
        {
          child: {
            id: "mem-other-child", accountId: "acc-2", name: "Wilma",
            avatarUrl: null, color: null, dashboardTheme: null
          },
          access: "view",
          todos: [SHARED_TODO]
        }
      ]
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const sharedThread = page.getByRole("region", { name: "Delad tråd: Wilma" });
  await expect(sharedThread).toBeVisible();
  await expect(sharedThread.getByText("Läxor")).toBeVisible();
  await expect(sharedThread.locator(".shared-child-thread__lock")).toBeVisible();
  await expect(sharedThread.getByRole("button", { name: /Endast visning/ })).toBeDisabled();
});

test("Todos-panelen: markera en delad uppgift klar (edit-åtkomst) anropar completeShared-endpointen", async ({ page }) => {
  const SHARED_TODO = {
    id: "todo-shared-2", accountId: "acc-2", title: "Diska", createdBy: "mem-other-parent",
    assignedTo: "mem-other-child", isShared: false, status: "pending", starValue: 2,
    visual: { type: "lucide-icon", value: "Sparkles" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null,
    visibleFrom: null, expiresAt: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let completedCalled = false;

  await mockAuthAndData(page);
  await page.route("**/api/todos/shared-children", (route) =>
    route.fulfill({
      json: [
        {
          child: {
            id: "mem-other-child", accountId: "acc-2", name: "Wilma",
            avatarUrl: null, color: null, dashboardTheme: null
          },
          access: "edit",
          todos: completedCalled ? [] : [SHARED_TODO]
        }
      ]
    })
  );
  await page.route("**/api/todos/shared/acc-2/mem-other-child/todo-shared-2/complete", (route) => {
    completedCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const sharedThread = page.getByRole("region", { name: "Delad tråd: Wilma" });
  const ball = sharedThread.getByRole("button", { name: /Diska/ });
  await expect(ball).toBeEnabled();

  // Håll intryckt 2s (samma mönster/testkonvention som ParentTodoThreadView.tsx:s
  // egen håll-in-avklarmarkering, se parent-todo-thread-view.spec.ts) —
  // dispatchar pointer-eventet direkt på elementet istället för page.mouse,
  // setTimeout:en i webbläsaren löper ut av sig själv medan expect.poll väntar.
  await ball.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });

  await expect.poll(() => completedCalled).toBe(true);
});
