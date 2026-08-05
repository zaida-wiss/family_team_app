import { test, expect } from "@playwright/test";
import { mockDataAPIs, MEMBER } from "./helpers";

// 2026-08-03, Zaidas önskemål: "en sökruta och en plusknapp där jag kan
// lägga till kategorier och uppgifter, dela den hooken med todo i min
// personliga vy. Jag vill även kunna ändra todos genom att mass importera
// och exportera, samt kunna massradera enkelt, utan att jag råkar göra det
// i misstag" — riktiga familjekategorier (TodoCategory.isFamily:true),
// samma CRUD-hook som Todos-panelens personliga kategorier, en egen tråd
// per familjekategori i Hem-vyns Todos-flik, sida vid sida med den
// okategoriserade Familjen-poolen.

type Category = { id: string; accountId: string; memberId: string; name: string; isFamily?: boolean; hidden?: boolean; deletedAt: null; deletedBy: null; createdAt: string };

// 2026-08-05, Zaidas beslut: "aldrig bara en kategori" — en ny
// familjekategori skapas nu alltid TILLSAMMANS med sin första uppgift, i
// samma litet formulär (ingen egen "skapa tom kategori"-väg finns kvar).
test("Hem-vyns Todos-flik: skapa en familjekategori och dess första uppgift i samma steg via +, byt namn", async ({ page }) => {
  const categories: Category[] = [];
  const todos: Record<string, unknown>[] = [];
  let lastTodoPost: Record<string, unknown> | null = null;

  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" },
        memberships: [{ member: MEMBER, account: { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null } }]
      }
    })
  );

  await page.route("**/api/todo-categories", (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { name: string; isFamily?: boolean };
      const category: Category = {
        id: "cat-family-1",
        accountId: "acc-1",
        memberId: "mem-1",
        name: body.name,
        isFamily: Boolean(body.isFamily),
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date().toISOString()
      };
      categories.push(category);
      return route.fulfill({ status: 201, json: category });
    }
    return route.fulfill({ json: categories });
  });
  await page.route("**/api/todo-categories/cat-family-1", (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { name: string };
      categories[0].name = body.name;
      return route.fulfill({ json: { ok: true } });
    }
    return route.continue();
  });
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "POST") {
      lastTodoPost = route.request().postDataJSON() as Record<string, unknown>;
      const todo = {
        id: "todo-new-1",
        accountId: "acc-1",
        title: lastTodoPost.title,
        assignedTo: lastTodoPost.assignedTo ?? null,
        createdBy: "mem-1",
        personalCategoryId: lastTodoPost.personalCategoryId ?? null,
        status: "pending",
        starValue: 0,
        visual: lastTodoPost.visual,
        recurrence: { type: "none" },
        recurringSourceId: null,
        deletedAt: null,
        inProgressBy: []
      };
      todos.push(todo);
      return route.fulfill({ status: 201, json: { id: "todo-new-1" } });
    }
    return route.fulfill({ json: todos });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  // Skapa en ny familjekategori OCH dess första uppgift i samma formulär
  // via "+"-knappen — knappen är avstängd tills båda fälten är ifyllda.
  await page.getByRole("button", { name: "Ny familjekategori" }).click();
  const submitButton = page.getByRole("button", { name: "Skapa familjekategori och uppgift" });
  await expect(submitButton).toBeDisabled();
  await page.getByLabel("Namn på ny familjekategori").fill("Hushåll");
  await expect(submitButton).toBeDisabled();
  await page.getByLabel("Namn på första uppgiften").fill("Dammsuga");
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect.poll(() => categories.length).toBe(1);
  expect(categories[0].isFamily).toBe(true);
  await expect.poll(() => lastTodoPost?.title).toBe("Dammsuga");
  expect(lastTodoPost?.personalCategoryId).toBe("cat-family-1");
  expect(lastTodoPost?.assignedTo).toBeNull();

  // Kategorin dyker upp som en egen tråd, redan med sin första uppgift.
  const categoryThreadHeader = page.getByRole("button", { name: /^Hushåll\./ });
  await expect(categoryThreadHeader).toBeVisible();

  // Byt namn på kategorin.
  await categoryThreadHeader.click();
  await page.getByRole("button", { name: "Byt namn" }).click();
  const renameInput = page.getByLabel("Nytt namn för Hushåll");
  await renameInput.fill("Städning");
  await renameInput.press("Enter");
  await expect(page.getByRole("button", { name: /^Städning\./ })).toBeVisible();
});

test("Hem-vyns Todos-flik: massradering av familjens uppgifter kräver en tvåstegsbekräftelse", async ({ page }) => {
  const deletedIds: string[] = [];
  const todos = [
    { id: "todo-1", accountId: "acc-1", title: "Handla mat", assignedTo: null, createdBy: "mem-1", personalCategoryId: null, status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "⭐" }, recurrence: { type: "none" }, recurringSourceId: null, deletedAt: null, inProgressBy: [] },
    { id: "todo-2", accountId: "acc-1", title: "Tvätta", assignedTo: null, createdBy: "mem-1", personalCategoryId: null, status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "⭐" }, recurrence: { type: "none" }, recurringSourceId: null, deletedAt: null, inProgressBy: [] }
  ];

  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" },
        memberships: [{ member: MEMBER, account: { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null } }]
      }
    })
  );
  await page.route("**/api/todos", (route) => route.fulfill({ json: todos }));
  await page.route("**/api/todos/*", (route) => {
    if (route.request().method() === "DELETE") {
      deletedIds.push(route.request().url().split("/").pop()!);
      return route.fulfill({ json: { ok: true } });
    }
    return route.continue();
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  const familyThreadHeader = page.getByRole("button", { name: /^Familjen\./ });
  await familyThreadHeader.click();
  await page.getByRole("button", { name: "Välj flera" }).click();

  await page.getByRole("button", { name: "Handla mat", exact: false }).click();
  await page.getByRole("button", { name: "Tvätta", exact: false }).click();
  await expect(page.getByText("2 valda")).toBeVisible();

  const removeButton = page.getByRole("button", { name: "Ta bort", exact: true });
  await removeButton.click();
  // Första klicket bekräftar bara — ingenting raderat än.
  expect(deletedIds).toEqual([]);
  await expect(page.getByRole("button", { name: "Bekräfta radering" })).toBeVisible();
  await page.getByRole("button", { name: "Bekräfta radering" }).click();
  await expect.poll(() => deletedIds.length).toBe(2);
});

// 2026-08-04, Zaidas önskemål: "tomma kategorier skall inte visas" — samma
// regel som den personliga Todos-panelen (parent-todo-thread-view.spec.ts),
// nu även för familjekategorier i Hem-vyn. 2026-08-05, Zaidas rättelse:
// gäller ALLTID, även en kategori som ALDRIG haft en uppgift — det
// ursprungliga undantaget (en helt ny kategori syns kvar tills första
// uppgiften läggs till) togs bort, eftersom kategori och första uppgift nu
// alltid skapas tillsammans i samma steg (se testet ovan) — det finns
// alltså aldrig ett läge där en riktigt tom kategori behöver vara nåbar.
test("Hem-vyns Todos-flik: en tom familjekategori döljs alltid, oavsett om den haft uppgifter tidigare eller aldrig använts", async ({ page }) => {
  const categories: Category[] = [
    { id: "cat-cleared", accountId: "acc-1", memberId: "mem-1", name: "Tömd", isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z" },
    { id: "cat-new", accountId: "acc-1", memberId: "mem-1", name: "Ny", isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z" }
  ];
  // Historiskt bevis på att "Tömd" använts — godkänd (inte längre väntande)
  // och långt utanför alla rimliga tidsspann, så den inte räknas som
  // "aktuell" men finns ändå kvar i den ofiltrerade todos-listan.
  const oldTodoInClearedCategory = {
    id: "todo-old", accountId: "acc-1", title: "Gammal uppgift", assignedTo: null, createdBy: "mem-1",
    personalCategoryId: "cat-cleared", status: "approved", starValue: 0,
    visual: { type: "lucide-icon", value: "⭐" }, recurrence: { type: "none" }, recurringSourceId: null,
    visibleFrom: "2020-01-01T00:00:00.000Z", expiresAt: "2020-01-01T01:00:00.000Z",
    deletedAt: null, inProgressBy: []
  };

  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" },
        memberships: [{ member: MEMBER, account: { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null } }]
      }
    })
  );
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: categories }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [oldTodoInClearedCategory] }));

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await expect(page.getByRole("button", { name: /^Ny\./ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Tömd\./ })).toHaveCount(0);
});

// 2026-08-05, Zaidas önskemål: "familjens todovys tomma kategorier skall
// gömmas, precis som i min egen todo-vy" — den ursprungliga fixen (ovan)
// kollade bara "har kategorin NÅGON pending uppgift, oavsett datum", inte
// om den faktiskt syns i det VALDA tidsspannet (parity med
// ParentTodoThreadView.tsx:s categoryAllTodos/isDueWithinRange). En kategori
// vars enda uppgift förfaller en annan dag ska döljas i "Bara idag".
test("Hem-vyns Todos-flik: en familjekategori utan något som förfaller idag döljs, syns igen med ett bredare tidsspann", async ({ page }) => {
  const categories: Category[] = [
    { id: "cat-tomorrow", accountId: "acc-1", memberId: "mem-1", name: "Imorgon", isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z" }
  ];
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const todoDueTomorrow = {
    id: "todo-tomorrow", accountId: "acc-1", title: "Imorgon-uppgift", assignedTo: null, createdBy: "mem-1",
    personalCategoryId: "cat-tomorrow", status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "⭐" }, recurrence: { type: "none" }, recurringSourceId: null,
    visibleFrom: tomorrow.toISOString(), expiresAt: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString(),
    deletedAt: null, inProgressBy: []
  };

  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" },
        memberships: [{ member: MEMBER, account: { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null } }]
      }
    })
  );
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: categories }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [todoDueTomorrow] }));

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  // "Bara idag" (default) — imorgondagens uppgift gör kategorin osynlig här.
  await expect(page.getByRole("button", { name: /^Imorgon\./ })).toHaveCount(0);

  // Bredare tidsspann (Inställningar → Utseende) — samma uppgift räknas nu
  // som "aktuell", kategorin syns igen.
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Utseende" }).click();
  await page.getByLabel("Hur mycket ska visas?").selectOption("week");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: "Hem", exact: true }).click();
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await expect(page.getByRole("button", { name: /^Imorgon\./ })).toBeVisible();
});

// 2026-08-05, Zaidas önskemål: "familjens todovy kan flytta uppgifter och
// kolumner med tre tryck" — kolumnerna (trådarna) gick redan att flytta
// bubblor INOM (tre tryck → editingThreadId), men inte flytta TRÅDARNA
// själva sinsemellan, till skillnad från ParentTodoThreadView.tsx.
test("Hem-vyns Todos-flik: trådarna/kolumnerna går att flytta med drag-and-drop, sparas via familyThreadOrder", async ({ page }) => {
  let savedOrder: string[] | null = null;
  const categories: Category[] = [
    { id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Träning", isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z" },
    { id: "cat-2", accountId: "acc-1", memberId: "mem-1", name: "Hushåll", isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z" }
  ];
  const todos = [
    { id: "todo-1", accountId: "acc-1", title: "Löpning", assignedTo: null, createdBy: "mem-1", personalCategoryId: "cat-1", status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "⭐" }, recurrence: { type: "none" }, recurringSourceId: null, visibleFrom: null, expiresAt: null, deletedAt: null, inProgressBy: [] },
    { id: "todo-2", accountId: "acc-1", title: "Dammsuga", assignedTo: null, createdBy: "mem-1", personalCategoryId: "cat-2", status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "⭐" }, recurrence: { type: "none" }, recurringSourceId: null, visibleFrom: null, expiresAt: null, deletedAt: null, inProgressBy: [] }
  ];

  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" },
        memberships: [{ member: MEMBER, account: { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null } }]
      }
    })
  );
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: categories }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: todos }));
  await page.route("**/api/members/mem-1", (route) => {
    const body = route.request().postDataJSON() as { familyThreadOrder?: string[] };
    if (body.familyThreadOrder) savedOrder = body.familyThreadOrder;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  const traningBtn = page.getByRole("button", { name: /^Träning\./ });
  const hushallBtn = page.getByRole("button", { name: /^Hushåll\./ });
  await expect(traningBtn).toBeVisible();
  await expect(hushallBtn).toBeVisible();

  const idsBefore = await page.locator(".todo-thread").evaluateAll((els) => els.map((el) => el.getAttribute("data-thread-id")));
  expect(idsBefore).toEqual(["__familyHome__", "cat-1", "cat-2"]);

  const traningBox = (await traningBtn.boundingBox())!;
  const hushallBox = (await hushallBtn.boundingBox())!;
  await page.mouse.move(hushallBox.x + hushallBox.width / 2, hushallBox.y + hushallBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(traningBox.x + traningBox.width / 2, traningBox.y + traningBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => savedOrder).not.toBeNull();
  expect(savedOrder).toEqual(["__familyHome__", "cat-2", "cat-1"]);

  const idsAfter = await page.locator(".todo-thread").evaluateAll((els) => els.map((el) => el.getAttribute("data-thread-id")));
  expect(idsAfter).toEqual(["__familyHome__", "cat-2", "cat-1"]);

  // Kategorimenyn ska INTE ha öppnats av draget.
  await expect(page.getByRole("button", { name: "Byt namn" })).toHaveCount(0);
});
