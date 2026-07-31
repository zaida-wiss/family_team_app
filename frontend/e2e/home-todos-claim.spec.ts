import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// 2026-07-31, Zaidas önskemål: "i min egen todo vy skall endast mina egna
// todos finnas, eller todos som jag signat upp mig på från familjevyn (hus
// ikonen)... Mina privata todos som jag inte delar med någon annan än mig
// själv skall inte visas i familjevyns todo." — Hem-vyns Todos-flik visar nu
// familje-/vuxen-todos med en "Ta uppgiften"/"Släpp"-knapp (claim/unclaim,
// sätter assignedTo), Todos-panelen visar bara det som är tilldelat mig.

const CATEGORY = {
  id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Träning",
  createdAt: "2024-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null
};

const FAMILY_TODO = {
  id: "todo-family", accountId: "acc-1", title: "Handla mat", createdBy: "mem-1",
  assignedTo: null, isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};

const PRIVATE_TODO = {
  ...FAMILY_TODO, id: "todo-private", title: "Hemlig grej", assignedTo: "mem-1", personalCategoryId: "cat-1"
};

test("Hem-vyns Todos-flik: 'Ta uppgiften' på en Familjen-todo gör den min, syns då i Todos-panelen; privata todos syns aldrig i Hem", async ({ page }) => {
  let patchedTodo: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? [FAMILY_TODO, PRIVATE_TODO] : {} })
  );
  await page.route(`**/api/todos/${FAMILY_TODO.id}`, (route) => {
    if (route.request().method() === "PATCH") {
      patchedTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  // Todos ligger bakom en flik i Hem (2026-07-31) — inte synligt förrän man
  // klickar ikonen bredvid familjeväljaren.
  await page.getByRole("button", { name: "Visa todos" }).click();

  // Hem: Familjen-todon syns med en "Ta uppgiften"-knapp, den privata gör det inte.
  const homeTodosCard = page.locator("article.dashboard").filter({ hasText: "Uppgifter" });
  await expect(homeTodosCard.getByText("Handla mat")).toBeVisible();
  await expect(homeTodosCard.getByText("Hemlig grej")).toHaveCount(0);

  await homeTodosCard.getByRole("button", { name: "Ta uppgiften" }).click();
  await expect.poll(() => patchedTodo?.assignedTo).toBe("mem-1");

  // Todos-panelen: bara det som är tilldelat mig (inklusive den precis
  // tagna Familjen-todon), aldrig en otagen Familjen-todo. exact:true — Hem-
  // vyns egen "Visa todos"-flikknapp innehåller annars "Todos" som substräng.
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByRole("button", { name: /Hemlig grej/ })).toBeVisible();
});

test("Todos-panelen: Barn-tråden döljs som standard, en toggle i Inställningar visar den igen", async ({ page }) => {
  const CHILD_MEMBER = {
    id: "mem-child", accountId: "acc-1", userId: null, name: "Barnet", roleId: "role-child", isChild: true,
    avatarUrl: null, color: null, dashboardTheme: null, spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
  };
  const CHILD_TODO = { ...FAMILY_TODO, id: "todo-child", title: "Läxor", assignedTo: "mem-child" };
  let patchedMember: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_MEMBER] }));
  await page.route("**/api/members/mem-1", (route) => {
    if (route.request().method() === "PATCH") {
      patchedMember = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [CHILD_TODO] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await expect(page.getByRole("region", { name: "Tråd: Barn" })).toHaveCount(0);

  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Utseende" }).click();
  await page.getByLabel("Visa barnens uppgifter i Todos-panelen").check();
  await expect.poll(() => patchedMember?.showChildTodosInOwnView).toBe(true);

  await page.getByRole("button", { name: "Todos" }).click();
  await expect(page.getByRole("region", { name: "Tråd: Barn" }).getByText("Läxor")).toBeVisible();
});
