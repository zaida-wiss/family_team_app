/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

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

// Tråd-vyn (bubbelvyn) är den enda vyn i panelen sedan 2026-07-05 (Zaidas
// beslut) — ingen egen växlare där längre, bara kategori/+-knappen/todos.
// Listläget väljs numera i Inställningar, se växlaTillListlage() nedan.
async function openThreadView(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();
}

async function switchToListViewInSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByLabel("Todos-vy").selectOption("list");
  await page.getByRole("button", { name: "Todos" }).click();
}

// Den fristående +-knappen togs bort 2026-07-06 (Zaidas beslut) — nya
// uppgifter skapas nu enbart via en trådens egen "Lägg till uppgift"-
// menyval. Barn-tråden (alltid närvarande, även utan personliga kategorier)
// är fallbacket när inga kategorier finns än.
async function openCreateModalFromBarnThread(page: import("@playwright/test").Page) {
  await page.getByRole("region", { name: "Tråd: Barn" }).getByRole("button", { name: /Barn/ }).click();
  await page.getByRole("button", { name: "Lägg till uppgift" }).click();
}

async function openCreateModalFromCategoryThread(page: import("@playwright/test").Page, categoryLabel: string) {
  const thread = page.getByRole("region", { name: `Tråd: ${categoryLabel}` });
  await thread.getByRole("button", { name: new RegExp(categoryLabel) }).click();
  await thread.getByRole("button", { name: "Lägg till uppgift" }).click();
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

test("Bollar i tråd: visar bara dagens todos — inte de som ännu inte syns eller redan gått ut", async ({ page }) => {
  const todoToday = { ...PERSONAL_TODO_NO_SUBTASKS, id: "todo-today", title: "Idag" };
  const todoNoSchedule = {
    ...PERSONAL_TODO_NO_SUBTASKS,
    id: "todo-no-schedule",
    title: "Utan schema",
    visibleFrom: null,
    expiresAt: null
  };
  // Syns först om fem dagar — ska INTE visas idag.
  const todoFuture = {
    ...PERSONAL_TODO_NO_SUBTASKS,
    id: "todo-future",
    title: "Om fem dagar",
    visibleFrom: "2026-07-10T00:00:00.000Z",
    expiresAt: null
  };
  // Gick ut för fyra dagar sedan — ska INTE visas idag.
  const todoExpired = {
    ...PERSONAL_TODO_NO_SUBTASKS,
    id: "todo-expired",
    title: "För fyra dagar sedan",
    visibleFrom: null,
    expiresAt: "2026-07-01T00:00:00.000Z"
  };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: [todoToday, todoNoSchedule, todoFuture, todoExpired] })
  );

  await openThreadView(page);

  const thread = page.getByRole("region", { name: "Tråd: Träning" });
  await expect(thread.getByText("Idag")).toBeVisible();
  await expect(thread.getByText("Utan schema")).toBeVisible();
  await expect(thread.getByText("Om fem dagar")).toHaveCount(0);
  await expect(thread.getByText("För fyra dagar sedan")).toHaveCount(0);
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

test("Bollar i tråd: kort tryck öppnar visa-vyn med checklista, avbockning anropar API:et", async ({ page }) => {
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

test("Bollar i tråd: kort tryck öppnar en läsbar visa-vy (utan redigerbara fält), inte redigeraformuläret direkt", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [PERSONAL_TODO_NO_SUBTASKS] }));

  await openThreadView(page);

  const ball = page.getByRole("button", { name: /Löpning/ });
  // Bollen är inte disabled — det skulle blockera pointer-eventen som
  // långtryck-avklarmarkeringen (S4) behöver.
  await expect(ball).toBeEnabled();
  await ball.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Löpning")).toBeVisible();
  // Läsbar visa-vy (TodoDetailView, 2026-07-05) — inga redigerbara fält och
  // ingen Spara-knapp här, bara en pennikon till redigeringen.
  await expect(dialog.getByLabel("Anteckningar")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Spara" })).toHaveCount(0);
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Redigera uppgift" })).toBeVisible();
});

test("Bollar i tråd: pennikonen i visa-vyn öppnar redigeringsformuläret, och sparar ändringen", async ({ page }) => {
  let updatedPatch: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [PERSONAL_TODO_NO_SUBTASKS] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-2", (route) => {
    if (route.request().method() === "PATCH") {
      updatedPatch = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await page.getByRole("button", { name: /Löpning/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Redigera uppgift" }).click();

  const editDialog = page.getByRole("dialog", { name: "Redigera uppgift" });
  await expect(editDialog).toBeVisible();
  // Ingen checklista att kryssa av — sektionen finns bara i visa-vyn.
  await expect(editDialog.getByRole("checkbox")).toHaveCount(0);

  await editDialog.getByLabel("Anteckningar").fill("Kom ihåg skorna");
  await editDialog.getByRole("button", { name: "Spara" }).click();

  await expect.poll(() => updatedPatch?.notes).toBe("Kom ihåg skorna");
  await expect(editDialog).toHaveCount(0);
});

// Radera-knappen fanns bara i list-vyns rader — försvann ur räckhåll helt när
// tråd-vyn blev default (ingen väg dit i visa/redigera-modalerna), upptäckt
// och fixat 2026-07-05 vid Zaidas fråga om varför hon inte längre kunde
// radera en todo.
test("Redigera uppgift: raderar uppgiften via papperskorgs-knappen", async ({ page }) => {
  let deletedId: string | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [PERSONAL_TODO_NO_SUBTASKS] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-2", (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = "todo-2";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await page.getByRole("button", { name: /Löpning/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Redigera uppgift" }).click();
  await page.getByRole("dialog", { name: "Redigera uppgift" }).getByRole("button", { name: "Radera" }).click();

  await expect.poll(() => deletedId).toBe("todo-2");
});

// Subtasks-datamodellen fanns sedan Sprint 6, men saknade helt en UI för att
// skapa/ta bort delmoment (bara toggle av redan existerande fanns) — upptäckt
// och fixat 2026-07-05 vid Zaidas önskemål om en egen checklista i anteckningarna.
test("Redigera uppgift: lägger till ett delmoment via den nya checklista-hanteraren", async ({ page }) => {
  let updatedPatch: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [PERSONAL_TODO_NO_SUBTASKS] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-2", (route) => {
    if (route.request().method() === "PATCH") {
      updatedPatch = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await page.getByRole("button", { name: /Löpning/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Redigera uppgift" }).click();

  const editDialog = page.getByRole("dialog", { name: "Redigera uppgift" });
  await editDialog.getByRole("button", { name: "Lägg till delmoment" }).click();
  await editDialog.getByLabel("Delmomentets titel").fill("Dammsuga");
  await editDialog.getByRole("button", { name: "Spara" }).click();

  await expect.poll(() => updatedPatch?.subtasks).toEqual([
    { id: expect.any(String), title: "Dammsuga", done: false }
  ]);
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

// Konsoliderat till en enda liten plus-ikon + modal (2026-07-05, Zaidas beslut)
// — ersätter de tidigare spridda inline-affordanserna (en "Lägg till"-knapp
// per tråd + en egen "Ny kategori"-kolumn) för ett mer platsbesparande flöde.
test("Ny uppgift-modalen: skapar en ny uppgift OCH kategori samtidigt när inga kategorier finns än", async ({ page }) => {
  let createdCategoryName: string | null = null;
  let createdTodo: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      createdCategoryName = (route.request().postDataJSON() as { name: string }).name;
      return route.fulfill({
        status: 201,
        json: { id: "cat-new", accountId: "acc-1", memberId: "mem-1", name: createdCategoryName, createdAt: new Date().toISOString(), deletedAt: null, deletedBy: null }
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await expect(page.getByRole("region", { name: "Tråd: Barn" })).toBeVisible();

  await openCreateModalFromBarnThread(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Ingen kategori finns än — väljaren visar ändå "Ingen kategori" som förval
  // (tvingar inte fram en kategori), men "+ Ny kategori…" går att välja direkt.
  const categorySelect = dialog.getByRole("combobox", { name: "Kategori" });
  await expect(categorySelect).toHaveValue("__none__");

  await dialog.getByLabel("Titel").fill("Handla mat");
  await categorySelect.selectOption({ label: "+ Ny kategori…" });
  await dialog.getByLabel("Namn på ny kategori").fill("Hushåll");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdCategoryName).toBe("Hushåll");
  await expect.poll(() => createdTodo?.title).toBe("Handla mat");
  expect(createdTodo?.assignedTo).toBe("mem-1");
  expect(createdTodo?.createdBy).toBe("mem-1");
  expect(createdTodo?.personalCategoryId).toBe("cat-new");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Tråd: Hushåll" }).getByText("Handla mat")).toBeVisible();
});

test("Ny uppgift-modalen: lägger till en uppgift i en befintlig kategori via väljaren", async ({ page }) => {
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
  await openCreateModalFromCategoryThread(page, "Träning");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Yoga");
  // Standardvalet i väljaren är redan den kategori man klickade "Lägg till uppgift" i (Träning).
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodo?.title).toBe("Yoga");
  expect(createdTodo?.personalCategoryId).toBe("cat-1");
  await expect(page.getByRole("region", { name: "Tråd: Träning" }).getByText("Yoga")).toBeVisible();
});

// Kombinerad enhet+intervall+veckodagar-modell (2026-07-05, ADR-0015).
test("Ny uppgift-modalen: skapar en återkommande uppgift med veckodagar och intervall", async ({ page }) => {
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
  await openCreateModalFromCategoryThread(page, "Träning");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Vattna blommorna");

  await dialog.getByLabel("Återkommer").selectOption("recurring");
  await dialog.getByLabel("Intervall").fill("3");
  await dialog.getByLabel("Enhet för återkommelse").selectOption("week");
  // Startdatum krävs för en återkommande uppgift (2026-07-06-spärren, se
  // incidents/2026-07-06-barnens-rutiner-forsvann.md) — satt här så att
  // disabled-kontrollen nedan isolerat testar veckodags-hintet.
  await dialog.getByLabel("Startdatum").fill("2026-07-06");
  // Veckodagarna startar tomma som default (Zaidas beslut 2026-07-05) —
  // Skapa-knappen är avstängd tills minst en dag väljs.
  const createButton = dialog.getByRole("button", { name: "Skapa" });
  await expect(dialog.getByText("Välj minst en veckodag.")).toBeVisible();
  await expect(createButton).toBeDisabled();

  await dialog.getByRole("group", { name: "Veckodagar" }).getByRole("button", { name: "mån" }).click();
  await dialog.getByRole("group", { name: "Veckodagar" }).getByRole("button", { name: "ons" }).click();
  await expect(createButton).toBeEnabled();
  await createButton.click();

  await expect.poll(() => createdTodo?.title).toBe("Vattna blommorna");
  expect(createdTodo?.recurrence).toEqual({
    type: "recurring",
    unit: "week",
    every: 3,
    daysOfWeek: ["monday", "wednesday"]
  });
});

// Flera tidsintervall per dag på samma återkommande uppgift (2026-07-05,
// Zaidas önskemål, t.ex. "borsta tänder" morgon OCH kväll som EN mall).
test("Ny uppgift-modalen: en återkommande uppgift kan få flera tidsintervall samma dag", async ({ page }) => {
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
  await openCreateModalFromCategoryThread(page, "Träning");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Borsta tänderna");
  await dialog.getByLabel("Återkommer").selectOption("recurring");
  await dialog.getByLabel("Enhet för återkommelse").selectOption("day");
  await dialog.getByLabel("Startdatum").fill("2026-07-06");

  const timeRows = dialog.locator(".time-windows-picker__row");
  await expect(timeRows).toHaveCount(1);
  await timeRows.nth(0).getByLabel("Från kl.").fill("07:00");
  await timeRows.nth(0).getByLabel("Till kl.").fill("07:15");

  await dialog.getByRole("button", { name: "Lägg till tid" }).click();
  await expect(timeRows).toHaveCount(2);
  await timeRows.nth(1).getByLabel("Från kl.").fill("19:00");
  await timeRows.nth(1).getByLabel("Till kl.").fill("19:15");

  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodo?.title).toBe("Borsta tänderna");
  const windows = createdTodo?.timeWindows as Array<{ visibleFrom: string; expiresAt: string }>;
  expect(windows).toHaveLength(2);
  expect(new Date(windows[0].visibleFrom).getHours()).toBe(7);
  expect(new Date(windows[1].visibleFrom).getHours()).toBe(19);
});

test("Ny uppgift-modalen: tilldelar en ny uppgift till ett barn istället för mig själv", async ({ page }) => {
  let createdTodo: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_MEMBER] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await openCreateModalFromBarnThread(page);
  const dialog = page.getByRole("dialog");

  // Åt vem? är sedan 2026-07-06 en flerval-knappgrupp (går att välja flera
  // mottagare samtidigt) — här väljs bara barnet, "Mig själv" väljs bort.
  const assigneePicker = dialog.getByRole("group", { name: "Åt vem?" });
  await assigneePicker.getByRole("button", { name: "Mig själv" }).click();
  await assigneePicker.getByRole("button", { name: "Lilla Barnet" }).click();
  await dialog.getByLabel("Titel").fill("Plocka undan leksaker");
  await dialog.getByLabel("Stjärnor").fill("3");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodo?.title).toBe("Plocka undan leksaker");
  expect(createdTodo?.assignedTo).toBe("mem-child-1");
  expect(createdTodo?.createdBy).toBe("mem-1");
  expect(createdTodo?.starValue).toBe(3);
  await expect(page.getByRole("region", { name: "Tråd: Barn" }).getByText("Plocka undan leksaker")).toBeVisible();
});

// Zaida: "när jag lägger in en ny todo-uppgift så vill jag kunna välja flera
// familjemedlemmar samtidigt som alla ska få uppgiften" (2026-07-06) — varje
// vald mottagare får en egen kopia av uppgiften (samma mönster som
// CSV-importen: en todo per mottagare, inte en delad uppgift).
test("Ny uppgift-modalen: väljer flera mottagare samtidigt, alla får varsin kopia av uppgiften", async ({ page }) => {
  const createdTodos: Record<string, unknown>[] = [];
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_MEMBER] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      createdTodos.push(body);
      return route.fulfill({ status: 201, json: { id: body.id } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await openCreateModalFromBarnThread(page);
  const dialog = page.getByRole("dialog");

  // "Mig själv" är förvalt som default — lämnas ikryssat och lägger till
  // barnet också, så BÅDA ska få varsin uppgift.
  const assigneePicker = dialog.getByRole("group", { name: "Åt vem?" });
  await assigneePicker.getByRole("button", { name: "Lilla Barnet" }).click();
  await dialog.getByLabel("Titel").fill("Städa vardagsrummet");
  await dialog.getByLabel("Stjärnor").fill("2");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodos.length).toBe(2);
  const assignees = createdTodos.map((t) => t.assignedTo).sort();
  expect(assignees).toEqual(["mem-1", "mem-child-1"].sort());
  expect(createdTodos.every((t) => t.title === "Städa vardagsrummet")).toBe(true);
  // Olika id — två oberoende todos, inte en delad uppgift.
  expect(createdTodos[0].id).not.toBe(createdTodos[1].id);
  // Stjärnor gäller bara barnets kopia, min egen kopia har alltid 0.
  const childCopy = createdTodos.find((t) => t.assignedTo === "mem-child-1");
  const selfCopy = createdTodos.find((t) => t.assignedTo === "mem-1");
  expect(childCopy?.starValue).toBe(2);
  expect(selfCopy?.starValue).toBe(0);
});

test("Ny uppgift-modalen: skapar en ny kategori via +Ny kategori-valet när kategorier redan finns", async ({ page }) => {
  let createdCategoryName: string | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [CATEGORY] });
    if (route.request().method() === "POST") {
      createdCategoryName = (route.request().postDataJSON() as { name: string }).name;
      return route.fulfill({
        status: 201,
        json: { id: "cat-new", accountId: "acc-1", memberId: "mem-1", name: createdCategoryName, createdAt: new Date().toISOString(), deletedAt: null, deletedBy: null }
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await openThreadView(page);
  await openCreateModalFromCategoryThread(page, "Träning");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Städa garaget");
  await dialog.getByRole("combobox", { name: "Kategori" }).selectOption({ label: "+ Ny kategori…" });
  await dialog.getByLabel("Namn på ny kategori").fill("Hushåll");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdCategoryName).toBe("Hushåll");
  await expect(page.getByRole("region", { name: "Tråd: Hushåll" }).getByText("Städa garaget")).toBeVisible();
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

  // Klick öppnar en liten meny (2026-07-05, Zaidas beslut) — "Byt namn"
  // eller "Lägg till uppgift" — istället för att direkt öppna redigering.
  await thread.getByRole("button", { name: /Träning/ }).click();
  await thread.getByRole("button", { name: "Byt namn" }).click();
  await thread.getByRole("textbox").fill("Gym");
  await page.keyboard.press("Enter");
  await expect.poll(() => renamedTo).toBe("Gym");
  const renamedThread = page.getByRole("region", { name: "Tråd: Gym" });
  await expect(renamedThread).toBeVisible();

  // "Radera" i menyn tar bort kategorin (2026-07-05, Zaidas beslut, utökad
  // senare samma dag) — ersätter den tidigare håll-intryckt (2s)-mekanismen
  // helt med en explicit menyknapp.
  await renamedThread.getByRole("button", { name: /Gym/ }).click();
  await renamedThread.getByRole("button", { name: "Radera" }).click();
  await expect.poll(() => deletedId).toBe("cat-1");
  await expect(page.getByRole("region", { name: "Tråd: Gym" })).toHaveCount(0);
});

test("Bollar i tråd: 'Ladda ner' i kategorimenyn exporterar bara den kategorins uppgifter som CSV", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: [PERSONAL_TODO_WITH_SUBTASKS] })
  );

  await openThreadView(page);
  const thread = page.getByRole("region", { name: "Tråd: Träning" });
  await thread.getByRole("button", { name: /Träning/ }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    thread.getByRole("button", { name: "Ladda ner" }).click()
  ]);

  expect(download.suggestedFilename()).toBe("todos-Träning.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  expect(text).toContain("Styrketräning");
});

test("Bollar i tråd: 'Göm' i kategorimenyn döljer tråden, 'Visa igen' i Inställningar visar den igen", async ({ page }) => {
  let hiddenValue: boolean | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todo-categories/cat-1/hidden", (route) => {
    hiddenValue = (route.request().postDataJSON() as { hidden: boolean }).hidden;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await openThreadView(page);
  const thread = page.getByRole("region", { name: "Tråd: Träning" });
  await thread.getByRole("button", { name: /Träning/ }).click();
  await thread.getByRole("button", { name: "Göm" }).click();

  await expect.poll(() => hiddenValue).toBe(true);
  await expect(page.getByRole("region", { name: "Tråd: Träning" })).toHaveCount(0);

  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "🙈 Gömda kategorier" }).click();
  await expect(page.getByText("Träning")).toBeVisible();
  await page.getByRole("button", { name: "Visa igen" }).click();

  await expect.poll(() => hiddenValue).toBe(false);
  await page.getByRole("button", { name: "Todos" }).click();
  await expect(page.getByRole("region", { name: "Tråd: Träning" })).toBeVisible();
});

test("Bollar i tråd: 'Lägg till uppgift' i kategorimenyn öppnar skapa-modalen med kategorin förvald", async ({ page }) => {
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
  await thread.getByRole("button", { name: /Träning/ }).click();
  await thread.getByRole("button", { name: "Lägg till uppgift" }).click();

  const dialog = page.getByRole("dialog", { name: "Ny uppgift" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Kategori" })).toHaveValue("cat-1");

  await dialog.getByLabel("Titel").fill("Styrketräning");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodo?.title).toBe("Styrketräning");
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

// Listläget väljs i Inställningar (2026-07-05, Zaidas beslut) — panelen har
// ingen egen växlare längre, bara kategori/+-knappen/todouppgifterna.
test("Todos-vy: byter till listläge via Inställningar, ingen tråd-växlare i panelen", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [PERSONAL_TODO_WITH_SUBTASKS] }));

  await openThreadView(page);
  await expect(page.getByRole("region", { name: "Tråd: Träning" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lista" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bollar i tråd" })).toHaveCount(0);

  await switchToListViewInSettings(page);
  await expect(page.getByRole("region", { name: "Tråd: Träning" })).toHaveCount(0);
  await expect(page.getByText("Styrketräning")).toBeVisible();
});

test("Bollar i tråd: visar Bubbelsysslor-rubriken bara i tråd-läget, inte i listläget", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await openThreadView(page);
  // Tråd-läget (bubbelvyn) är default sedan 2026-07-05 (Zaidas beslut).
  await expect(page.getByRole("heading", { name: "Bubbelsysslor ✨" })).toBeVisible();
  await expect(page.getByText("Dagens familjebubblor")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Todos" })).toHaveCount(0);

  await switchToListViewInSettings(page);
  await expect(page.getByRole("heading", { name: "Bubbelsysslor ✨" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
});

// Zaida: "Vi har ingen emoji i todon. Det måste vi ha." (2026-07-06) — en
// emoji-väljare (samma EmojiPickerPortal som belöningsbutiken/Medaljer/barnens
// rutinskapare redan använder) lades till i skapa- och redigera-modalen, som
// sätter Todo.visual.value. Samma dag, uppföljning: emojin ska INTE visas i
// vuxenvyn (bollen/visa-vyn/Inställningar), bara i barnvyn — testet
// verifierar därför bara att valet sparas i payloaden, inte att den syns här.
test("Ny uppgift-modalen: väljer en emoji som sparas på uppgiften", async ({ page }) => {
  let createdTodo: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: createdTodo ? [createdTodo] : [] });
    }
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await openCreateModalFromBarnThread(page);
  const dialog = page.getByRole("dialog");

  await dialog.locator(".todo-emoji-btn").click();
  await page.getByPlaceholder("Sök på svenska...").fill("tandborste");
  await page.locator('button[title="Tandborste"]').click();

  await dialog.getByLabel("Titel").fill("Borsta tänderna");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodo?.title).toBe("Borsta tänderna");
  expect((createdTodo?.visual as { value: string })?.value).toBe("🪥");
});

// Zaida: "när jag ska redigera den så kan jag [lägga till deluppgifter],
// jag vill att det ska vara samma på bägge ställen" (2026-07-06) — checklista-
// sektionen som redan fanns i TodoEditModal speglades in i TodoCreatorModal.
test("Ny uppgift-modalen: kan lägga till delmoment redan vid skapande", async ({ page }) => {
  let createdTodo: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });

  await openThreadView(page);
  await openCreateModalFromBarnThread(page);
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Titel").fill("Städa rummet");
  await dialog.getByRole("button", { name: "Lägg till delmoment" }).click();
  await dialog.getByLabel("Delmomentets titel").fill("Dammsuga");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodo?.title).toBe("Städa rummet");
  expect(createdTodo?.subtasks).toEqual([{ id: expect.any(String), title: "Dammsuga", done: false }]);
});

// Bugg Zaida hittade 2026-07-06: den återkommande MALLEN visades som en egen
// boll bredvid sin egen dagliga occurrence — mallen har bara ett ankardatum
// (inga riktiga tider), occurrensen har de faktiska tiderna från timeWindows,
// vilket gjorde att det såg ut som en dubblett. Fix: mallar visas aldrig som
// en egen boll längre, bara deras materialiserade occurrence gör det.
test("Bollar i tråd: återkommande mallen visas INTE som en egen boll bredvid sin dagliga occurrence", async ({ page }) => {
  const TEMPLATE = {
    id: "todo-template", accountId: "acc-1", title: "Borsta tänderna", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "🪥" },
    recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: "2026-07-01T00:00:00.000Z", expiresAt: null,
    deletedAt: null, deletedBy: null, routineCategory: null, personalCategoryId: "cat-1"
  };
  // Id:t måste matcha appens egen occurrenceId()-formel (recurringTodos.ts) —
  // annars tror syncScheduledTodos (som körs i bakgrunden på riktigt också)
  // att dagens occurrence saknas och skapar ännu en, vilket precis skulle
  // återinföra en (annan) dubblett i det här testet. Tider beräknas relativt
  // "nu" (inte hårdkodade klockslag) — annars blir occurrensen tyst "expired"
  // (expirePendingTodos) så fort testet råkar köras efter det hårdkodade
  // klockslaget, oavsett vilket datum det är (upptäckt 2026-07-06).
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const occurrenceStart = new Date(now.getTime() + 60 * 60 * 1000);
  const occurrenceEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const OCCURRENCE = {
    ...TEMPLATE,
    id: `todo-template-occurrence-${dateKey}`,
    recurrence: { type: "none" },
    recurringSourceId: "todo-template",
    occurrenceDate: dateKey,
    visibleFrom: occurrenceStart.toISOString(),
    expiresAt: occurrenceEnd.toISOString()
  };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TEMPLATE, OCCURRENCE] }));

  await openThreadView(page);
  const thread = page.getByRole("region", { name: "Tråd: Träning" });
  await expect(thread.locator(".todo-thread__ball")).toHaveCount(1);
});

// Uppföljning till dubblett-fixen ovan: mallen är fortsatt det enda stället
// att ändra återkommelsemönstret eller stoppa en serie, så en egen kompakt
// hanteringsyta byggdes i Inställningar istället för att bara försvinna
// (Zaidas beslut 2026-07-06).
test("Inställningar: återkommande uppgifter kan redigeras och tas bort i en egen lista", async ({ page }) => {
  const TEMPLATE = {
    id: "todo-template", accountId: "acc-1", title: "Borsta tänderna", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "🪥" },
    recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: "2026-07-01T00:00:00.000Z", expiresAt: null,
    deletedAt: null, deletedBy: null, routineCategory: null, personalCategoryId: null
  };
  let deletedId: string | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TEMPLATE] }));
  await page.route("**/api/todos/todo-template", (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = "todo-template";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "🔁 Återkommande uppgifter" }).click();

  const row = page.getByText("Borsta tänderna").locator("../..");
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Ta bort serien/ }).click();

  await expect.poll(() => deletedId).toBe("todo-template");
});

// Zaida: "Anteckningar och delmoment ska stå [i visa-vyn] också... det ska
// inte behöva vara redigeringsläge" (2026-07-06) — rubrikerna syns nu alltid,
// med en platshållartext när det inte finns något ännu, istället för att hela
// sektionen bara försvinner.
test("Bollar i tråd: visa-vyn visar alltid rubrikerna Delmoment och Anteckningar, även tomma", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [PERSONAL_TODO_NO_SUBTASKS] }));

  await openThreadView(page);
  await page.getByRole("button", { name: /Löpning/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delmoment" })).toBeVisible();
  await expect(dialog.getByText("Inga delmoment ännu.")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Anteckningar" })).toBeVisible();
  await expect(dialog.getByText("Inga anteckningar ännu.")).toBeVisible();
});

// Zaida: "Jag vill kunna flytta mina todokategorier med drag and drop på
// kategorinamnet" + "Även den [Barn-tråden] skall vara flyttbar" (2026-07-06).
// Pointer-baserat (inte HTML5 drag-and-drop) för att fungera på touch också —
// simuleras här med page.mouse, som Chromium omvandlar till riktiga
// pointer-events.
test("Bollar i tråd: kategorier (och Barn-tråden) går att flytta med drag-and-drop", async ({ page }) => {
  let savedOrder: string[] | null = null;
  const CATEGORY_2 = {
    id: "cat-2", accountId: "acc-1", memberId: "mem-1", name: "Hushåll",
    createdAt: "2024-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null
  };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY, CATEGORY_2] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/members/mem-1", (route) => {
    const body = route.request().postDataJSON() as { todoThreadOrder?: string[] };
    if (body.todoThreadOrder) savedOrder = body.todoThreadOrder;
    return route.fulfill({ json: { ok: true } });
  });

  await openThreadView(page);

  const traningBtn = page.getByRole("button", { name: /^Träning\./ });
  const hushallBtn = page.getByRole("button", { name: /^Hushåll\./ });
  await expect(traningBtn).toBeVisible();
  await expect(hushallBtn).toBeVisible();

  // Utgångsordning (ingen sparad ordning ännu): Barn, Träning, Hushåll.
  await expect(page.locator(".todo-thread")).toHaveCount(3);
  const idsBefore = await page.locator(".todo-thread").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-thread-id"))
  );
  expect(idsBefore).toEqual(["__children__", "cat-1", "cat-2"]);

  const traningBox = (await traningBtn.boundingBox())!;
  const hushallBox = (await hushallBtn.boundingBox())!;

  // Drar Hushåll till Tränings position (över tröskelvärdet på 8px, annars
  // tolkas det som ett vanligt klick som öppnar menyn istället).
  await page.mouse.move(hushallBox.x + hushallBox.width / 2, hushallBox.y + hushallBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(traningBox.x + traningBox.width / 2, traningBox.y + traningBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => savedOrder).not.toBeNull();
  expect(savedOrder).toEqual(["__children__", "cat-2", "cat-1"]);

  const idsAfter = await page.locator(".todo-thread").evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-thread-id"))
  );
  expect(idsAfter).toEqual(["__children__", "cat-2", "cat-1"]);

  // Kategorimenyn ska INTE ha öppnats av draget (bara ett vanligt klick ska
  // göra det).
  await expect(page.getByRole("button", { name: "Byt namn" })).toHaveCount(0);
});

// Zaida: "i nuläget markeras bara texten när jag ska lägga in en ny uppgift
// genom att hålla 2 sekunder på kategorinamnet... jag vill att menyn skall
// komma upp istället" (2026-07-06) — kategorinamnet saknade user-select:none,
// så ett stillastående håll markerade texten som vanlig text och stoppade
// klicket som annars öppnar menyn.
test("Bollar i tråd: ett stillastående 2s-håll på kategorinamnet markerar inte texten, öppnar menyn", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await openThreadView(page);
  const btn = page.getByRole("button", { name: /^Träning\./ });
  const box = (await btn.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2000);
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Byt namn" })).toBeVisible();
  const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selectionText).toBe("");
});
