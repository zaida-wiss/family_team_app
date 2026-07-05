import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Sprint 6 S2-S4 + ombyggnad 2026-07-05 (Zaidas beslut): vuxenvyns tråd-vy visar
// trådar sida vid sida. Längst till vänster: en gemensam "Barn"-tråd med ALLA
// barns väntande uppgifter (oavsett barn/kategori), så den vuxna har koll på
// läget för barnen också. Därefter: den inloggade vuxnas egna, personliga
// kategori-trådar (skapas/döps om/tas bort av medlemmen själv, delas inte med
// resten av kontot) — visar bara todos tilldelade ELLER skapade av den
// inloggade vuxna. Helt separat från routineCategory/ROUTINE_CATEGORIES, som
// fortsatt driver belöningsbutikens kategori-spärr och barnens rutinskapare
// oförändrat.

const CHILD_MEMBER = {
  id: "mem-child-1", accountId: "acc-1", userId: null,
  name: "Lilla Barnet", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

const CATEGORY = {
  id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Träning",
  createdAt: "2024-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null
};

const CHILD_TODO = {
  id: "todo-child-1", accountId: "acc-1", title: "Läxor", createdBy: "mem-1",
  assignedTo: "mem-child-1", isShared: false, status: "pending", starValue: 3,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  routineCategory: null, personalCategoryId: null
};

const PERSONAL_TODO_WITH_SUBTASKS = {
  id: "todo-1", accountId: "acc-1", title: "Styrketräning", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  routineCategory: null, personalCategoryId: "cat-1",
  subtasks: [
    { id: "sub-1", title: "Uppvärmning", done: true },
    { id: "sub-2", title: "Bänkpress", done: false }
  ]
};

const PERSONAL_TODO_NO_SUBTASKS = {
  id: "todo-2", accountId: "acc-1", title: "Löpning", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  routineCategory: null, personalCategoryId: "cat-1"
};

async function openThreadView(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
  await page.getByRole("button", { name: "Bollar i tråd" }).click();
}

test("Bollar i tråd: Barn-tråden samlar alla barns todos, personlig kategori-tråd visar bara mina egna", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD_MEMBER] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: [CHILD_TODO, PERSONAL_TODO_WITH_SUBTASKS] })
  );

  await openThreadView(page);

  await expect(page.getByRole("region", { name: "Tråd: Barn" }).getByText("Läxor")).toBeVisible();
  await expect(page.getByRole("region", { name: "Tråd: Träning" }).getByText("Styrketräning")).toBeVisible();
  // Ingen korskontaminering — barnets todo syns inte i den personliga tråden och tvärtom.
  await expect(page.getByRole("region", { name: "Tråd: Barn" }).getByText("Styrketräning")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Tråd: Träning" }).getByText("Läxor")).toHaveCount(0);
});

test("Bollar i tråd: sorterar på sluttid, tidigast sluttid överst", async ({ page }) => {
  const todoLate = { ...PERSONAL_TODO_NO_SUBTASKS, id: "todo-late", title: "Sent pass", expiresAt: "2026-07-10T18:00:00.000Z" };
  const todoEarly = { ...PERSONAL_TODO_NO_SUBTASKS, id: "todo-early", title: "Tidigt pass", expiresAt: "2026-07-08T08:00:00.000Z" };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  // Skickas medvetet i "fel" ordning (sen sluttid först) — testet ska bevisa
  // att komponenten sorterar om, inte bara återger API-ordningen.
  await page.route("**/api/todos", (route) => route.fulfill({ json: [todoLate, todoEarly] }));

  await openThreadView(page);

  const thread = page.getByRole("region", { name: "Tråd: Träning" });
  const balls = thread.locator(".todo-thread__ball");
  await expect(balls).toHaveCount(2);
  await expect(balls.nth(0)).toHaveAccessibleName(/Tidigt pass/);
  await expect(balls.nth(1)).toHaveAccessibleName(/Sent pass/);
});

test("Bollar i tråd: kort tryck öppnar checklista-modal, avbockning anropar API:et", async ({ page }) => {
  let toggledSubtaskId: string | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [PERSONAL_TODO_WITH_SUBTASKS] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-1/subtasks/sub-2", (route) => {
    toggledSubtaskId = "sub-2";
    return route.fulfill({ json: { done: true } });
  });

  await openThreadView(page);
  await page.getByRole("button", { name: /Styrketräning/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("50% klart")).toBeVisible();

  const doneCheckbox = dialog.getByRole("checkbox", { name: "Uppvärmning" });
  const pendingCheckbox = dialog.getByRole("checkbox", { name: "Bänkpress" });
  await expect(doneCheckbox).toBeChecked();
  await expect(pendingCheckbox).not.toBeChecked();

  await pendingCheckbox.click();
  await expect.poll(() => toggledSubtaskId).toBe("sub-2");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("Bollar i tråd: en boll utan delmoment går inte att öppna som checklista (men förblir klickbar för långtryck)", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [PERSONAL_TODO_NO_SUBTASKS] }));

  await openThreadView(page);

  const ball = page.getByRole("button", { name: /Löpning/ });
  // Bollen är inte disabled — det skulle blockera pointer-eventen som
  // långtryck-avklarmarkeringen (S4) behöver — men ett kort klick ska inte
  // öppna en checklista-modal när det inte finns några delmoment att kryssa av.
  await expect(ball).toBeEnabled();
  await ball.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Bollar i tråd: långt tryck (2s) markerar hela uppgiften klar och visar en bortdöende-animation innan den lämnar tråden", async ({ page }) => {
  let completed = false;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: completed ? [] : [PERSONAL_TODO_NO_SUBTASKS] });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-2/complete", (route) => {
    completed = true;
    return route.fulfill({ json: { ok: true } });
  });

  await openThreadView(page);

  const ball = page.getByRole("button", { name: /Löpning/ });
  await expect(ball).toBeVisible();
  // Simulerar ett 2+ sekunders håll genom att dispatcha pointer-event direkt på
  // elementet, istället för page.mouse (som hit-testar en OS-markörposition mot
  // sidans layout — ett litet layoutskifte räcker för att trigga pointerleave
  // i förtid; inte relaterat till håll-logiken, bara ett testmiljö-artefakt).
  await ball.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });

  // Direkt efter det bekräftade långtrycket ska bollen fortfarande finnas kvar
  // i DOM:en (inte försvunnit direkt), men markerad som bortdöende.
  await expect(ball).toHaveClass(/todo-thread__ball--dissolving/);
  await expect.poll(() => completed).toBe(true);

  // Efter bortdöende-animationen (500ms) ska bollen faktiskt vara borta, och
  // ingen checklista-modal ska ha öppnats (click-eventet vid pointerUp
  // undertrycks).
  await expect(ball).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Bollar i tråd: skapar en ny personlig kategori", async ({ page }) => {
  let createdName: string | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { name: string };
      createdName = body.name;
      return route.fulfill({
        status: 201,
        json: { id: "cat-new", accountId: "acc-1", memberId: "mem-1", name: body.name, createdAt: new Date().toISOString(), deletedAt: null, deletedBy: null }
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await openThreadView(page);
  await expect(page.getByRole("region", { name: "Tråd: Barn" })).toBeVisible();

  await page.getByRole("button", { name: "Ny kategori" }).click();
  await page.getByPlaceholder("Kategorinamn…").fill("Hushåll");
  await page.keyboard.press("Enter");

  await expect.poll(() => createdName).toBe("Hushåll");
  await expect(page.getByRole("region", { name: "Tråd: Hushåll" })).toBeVisible();
});

test("Bollar i tråd: döper om och tar bort en personlig kategori", async ({ page }) => {
  let renamedTo: string | null = null;
  let deletedId: string | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todo-categories/cat-1", (route) => {
    if (route.request().method() === "PATCH") {
      renamedTo = (route.request().postDataJSON() as { name: string }).name;
      return route.fulfill({ json: { ok: true } });
    }
    if (route.request().method() === "DELETE") {
      deletedId = "cat-1";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await openThreadView(page);
  const thread = page.getByRole("region", { name: "Tråd: Träning" });
  await expect(thread).toBeVisible();

  await thread.getByRole("button", { name: "Träning" }).click();
  await thread.getByRole("textbox").fill("Gym");
  await page.keyboard.press("Enter");
  await expect.poll(() => renamedTo).toBe("Gym");
  await expect(page.getByRole("region", { name: "Tråd: Gym" })).toBeVisible();

  await page.getByRole("region", { name: "Tråd: Gym" }).getByTitle("Ta bort kategori").click();
  await expect.poll(() => deletedId).toBe("cat-1");
  await expect(page.getByRole("region", { name: "Tråd: Gym" })).toHaveCount(0);
});

test("Bollar i tråd: lägger till en ny uppgift direkt i en personlig kategori-tråd", async ({ page }) => {
  let createdTodo: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  const thread = page.getByRole("region", { name: "Tråd: Träning" });
  await thread.getByRole("button", { name: "Lägg till" }).click();
  await page.getByPlaceholder("Ny uppgift…").fill("Yoga");
  await page.keyboard.press("Enter");

  await expect.poll(() => createdTodo?.title).toBe("Yoga");
  expect(createdTodo?.assignedTo).toBe("mem-1");
  expect(createdTodo?.createdBy).toBe("mem-1");
  expect(createdTodo?.personalCategoryId).toBe("cat-1");
});

test("Bollar i tråd: trådarna ligger sida vid sida, inte staplade", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await openThreadView(page);

  const childBox = await page.getByRole("region", { name: "Tråd: Barn" }).boundingBox();
  const categoryBox = await page.getByRole("region", { name: "Tråd: Träning" }).boundingBox();
  expect(childBox).not.toBeNull();
  expect(categoryBox).not.toBeNull();
  // Sida vid sida: ungefär samma Y-position (topp), men olika X-position.
  expect(Math.abs(childBox!.y - categoryBox!.y)).toBeLessThan(5);
  expect(categoryBox!.x).toBeGreaterThan(childBox!.x + childBox!.width - 5);
});

test("Bollar i tråd: växlar tillbaka till listan", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [PERSONAL_TODO_WITH_SUBTASKS] }));

  await openThreadView(page);
  await expect(page.getByRole("region", { name: "Tråd: Träning" })).toBeVisible();

  await page.getByRole("button", { name: "Lista" }).click();
  await expect(page.getByRole("region", { name: "Tråd: Träning" })).toHaveCount(0);
  await expect(page.getByText("Styrketräning")).toBeVisible();
});
