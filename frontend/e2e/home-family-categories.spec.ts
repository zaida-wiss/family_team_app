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

test("Hem-vyns Todos-flik: skapa en familjekategori via +, lägg till en uppgift i den, byt namn", async ({ page }) => {
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
  await page.getByRole("button", { name: "Visa todos" }).click();

  // Skapa en ny familjekategori via "+"-knappen.
  await page.getByRole("button", { name: "Ny familjekategori" }).click();
  await page.getByLabel("Namn på ny familjekategori").fill("Hushåll");
  await page.getByRole("button", { name: "Skapa familjekategori" }).click();
  await expect.poll(() => categories.length).toBe(1);
  expect(categories[0].isFamily).toBe(true);

  // Kategorin dyker upp som en egen tråd — lägg till en uppgift i DEN,
  // inte i den okategoriserade Familjen-poolen.
  const categoryThreadHeader = page.getByRole("button", { name: /^Hushåll\./ });
  await expect(categoryThreadHeader).toBeVisible();
  await categoryThreadHeader.click();
  await page.getByRole("button", { name: "Lägg till uppgift" }).click();
  await page.getByLabel("Lägg till en uppgift").fill("Dammsuga");
  await page.getByRole("button", { name: "Lägg till", exact: true }).click();
  await expect.poll(() => lastTodoPost?.title).toBe("Dammsuga");
  expect(lastTodoPost?.personalCategoryId).toBe("cat-family-1");
  expect(lastTodoPost?.assignedTo).toBeNull();

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
  await page.getByRole("button", { name: "Visa todos" }).click();

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
