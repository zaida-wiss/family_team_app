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

  await page.getByRole("button", { name: "Ny uppgift" }).click();
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
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Yoga");
  // Standardvalet i väljaren är redan den enda befintliga kategorin (Träning).
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
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Vattna blommorna");

  await dialog.getByLabel("Återkommer").selectOption("recurring");
  await dialog.getByLabel("Intervall").fill("3");
  await dialog.getByLabel("Enhet för återkommelse").selectOption("week");
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
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill("Borsta tänderna");
  await dialog.getByLabel("Återkommer").selectOption("recurring");
  await dialog.getByLabel("Enhet för återkommelse").selectOption("day");

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
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Åt vem?").selectOption({ label: "Lilla Barnet" });
  await dialog.getByLabel("Titel").fill("Plocka undan leksaker");
  await dialog.getByLabel("Stjärnor").fill("3");
  await dialog.getByRole("button", { name: "Skapa" }).click();

  await expect.poll(() => createdTodo?.title).toBe("Plocka undan leksaker");
  expect(createdTodo?.assignedTo).toBe("mem-child-1");
  expect(createdTodo?.createdBy).toBe("mem-1");
  expect(createdTodo?.starValue).toBe(3);
  await expect(page.getByRole("region", { name: "Tråd: Barn" }).getByText("Plocka undan leksaker")).toBeVisible();
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
  await page.getByRole("button", { name: "Ny uppgift" }).click();
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

  await thread.getByRole("button", { name: /Träning/ }).click();
  await thread.getByRole("textbox").fill("Gym");
  await page.keyboard.press("Enter");
  await expect.poll(() => renamedTo).toBe("Gym");
  const renamedThread = page.getByRole("region", { name: "Tråd: Gym" });
  await expect(renamedThread).toBeVisible();

  // Håll intryckt i två sekunder (2026-07-05, Zaidas beslut) tar bort
  // kategorin — ersätter den tidigare alltid synliga papperskorgs-knappen.
  // dispatchEvent direkt på elementet istället för page.mouse (som hit-testar
  // en OS-markörposition mot sidans layout — se motiveringen i övriga
  // långtryck-test i den här filen).
  const categoryButton = renamedThread.getByRole("button", { name: /Gym/ });
  await categoryButton.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await expect.poll(() => deletedId).toBe("cat-1");
  await expect(page.getByRole("region", { name: "Tråd: Gym" })).toHaveCount(0);
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
