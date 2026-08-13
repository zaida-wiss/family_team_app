import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// 2026-08-13, Zaidas önskemål: "filtrera och sortera för att snabbt och
// enkelt skapa ordning och struktur... snabbt ändra... det ska självklart
// vara möjligt att även redigera via en modal" — en tabellvy i Inställningar
// → Todo-lista → Tabellvy, inline-redigerbar med en Pencil-knapp per rad som
// öppnar den vanliga TodoEditModal.

const CAT_HUSHALL = {
  id: "cat-hushall", accountId: "acc-1", memberId: "mem-1", name: "Hushåll",
  isFamily: false, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
};
const CAT_SKOLA = {
  id: "cat-skola", accountId: "acc-1", memberId: "mem-1", name: "Skola",
  isFamily: false, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
};

const TODO_BASE = {
  accountId: "acc-1", createdBy: "mem-1", isShared: false, starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, deletedAt: null, deletedBy: null, notes: null
};

const TODO_MAT = {
  ...TODO_BASE, id: "todo-mat", title: "Handla mat", assignedTo: "mem-1", status: "pending",
  personalCategoryId: "cat-hushall",
  visibleFrom: "2026-08-14T08:00:00.000Z", expiresAt: "2026-08-14T09:00:00.000Z"
};
const TODO_STAD = {
  ...TODO_BASE, id: "todo-stad", title: "Städa rummet", assignedTo: null, status: "done",
  personalCategoryId: "cat-hushall",
  visibleFrom: null, expiresAt: "2026-08-14T20:00:00.000Z"
};
const TODO_LAXOR = {
  ...TODO_BASE, id: "todo-laxor", title: "Läxor", assignedTo: "mem-1", status: "pending",
  personalCategoryId: "cat-skola",
  visibleFrom: "2026-08-14T15:00:00.000Z", expiresAt: "2026-08-15T07:00:00.000Z"
};

async function openTable(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Todo-lista", exact: true }).click();
  await page.getByRole("button", { name: "📊 Tabellvy" }).click();
}

test("Tabellvyn filtrerar, sorterar, redigerar inline och kan öppna en rad i modal", async ({ page }) => {
  let patchedTitle: unknown = undefined;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CAT_HUSHALL, CAT_SKOLA] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO_MAT, TODO_STAD, TODO_LAXOR] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-mat", (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { title?: string };
      if ("title" in body) patchedTitle = body.title;
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todos/todo-stad/approve", (route) => route.fulfill({ json: { ok: true } }));

  await openTable(page);

  const table = page.getByRole("table");
  const rowMat = table.locator('tr[data-todo-id="todo-mat"]');
  const rowStad = table.locator('tr[data-todo-id="todo-stad"]');
  const rowLaxor = table.locator('tr[data-todo-id="todo-laxor"]');
  await expect(table).toBeVisible();
  await expect(rowMat).toBeVisible();
  await expect(rowStad).toBeVisible();
  await expect(rowLaxor).toBeVisible();

  // Filtrera på kategori — bara Skola-uppgiften (Läxor) ska synas.
  await page.getByLabel("Filtrera på kategori").selectOption({ label: "Skola" });
  await expect(rowLaxor).toBeVisible();
  await expect(rowMat).toHaveCount(0);
  await expect(rowStad).toHaveCount(0);
  await page.getByLabel("Filtrera på kategori").selectOption({ label: "Alla" });

  // Filtrera på status — bara den som väntar på godkännande (Städa rummet).
  await page.getByLabel("Filtrera på status").selectOption({ label: "Vill godkännas" });
  await expect(rowStad).toBeVisible();
  await expect(rowMat).toHaveCount(0);
  await page.getByLabel("Filtrera på status").selectOption({ label: "Alla" });

  // Sortera på Slut — växlar mellan stigande/fallande radordning.
  const rowOrder = () => table.locator("tbody tr").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-todo-id")));
  // Default-sortering (sluttid, stigande) redan vid start, ingen klickning behövs.
  await expect.poll(rowOrder).toEqual(["todo-mat", "todo-stad", "todo-laxor"]);
  await page.getByRole("button", { name: "Slut" }).click();
  await expect.poll(rowOrder).toEqual(["todo-laxor", "todo-stad", "todo-mat"]);
  await page.getByRole("button", { name: "Slut" }).click();
  await expect.poll(rowOrder).toEqual(["todo-mat", "todo-stad", "todo-laxor"]);

  // Redigera titeln inline — sparas vid blur, inte vid varje tangenttryckning.
  const titleInput = rowMat.getByLabel("Titel");
  await titleInput.fill("Handla mat och blöjor");
  await titleInput.blur();
  await expect.poll(() => patchedTitle).toBe("Handla mat och blöjor");
  await expect(rowMat.getByRole("button", { name: "Redigera Handla mat och blöjor i modal" })).toBeVisible();

  // Öppna samma rad i den vanliga redigerings-modalen.
  await rowMat.getByRole("button", { name: "Redigera Handla mat och blöjor i modal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Titel")).toHaveValue("Handla mat och blöjor");
  await dialog.getByRole("button", { name: "Stäng" }).click();

  // Godkänn direkt i tabellen (Städa rummet väntar på godkännande) — sist i
  // testet, eftersom godkännandet triggar en refreshTodos()-omhämtning som
  // annars kan racea mot (och skriva över) redigeringarna ovan.
  await rowStad.getByRole("button", { name: "Godkänn Städa rummet" }).click();
});

// Återkommande uppgifters titel/kategori/mottagare/schema skrivs via en helt
// egen mall-kontra-dag-uppdelning (TodoEditModal.tsx:s seriesPatch/dayPatch)
// — ett rått PATCH direkt från tabellen hade kunnat korrumpera serien (se
// kommentaren i TodoTableSettings.tsx). Verifierar att en sådan rad är
// skrivskyddad i tabellen och bara redigerbar via modalen.
test("En återkommande uppgifts rad är skrivskyddad i tabellen (redigeras bara via modal)", async ({ page }) => {
  const TODO_RUTIN = {
    ...TODO_BASE, id: "todo-rutin", title: "Kvällsrutin", assignedTo: "mem-1", status: "pending",
    personalCategoryId: null, recurrence: { type: "daily", interval: 1 },
    visibleFrom: "2026-08-14T19:00:00.000Z", expiresAt: "2026-08-14T20:00:00.000Z"
  };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO_RUTIN] });
    return route.fulfill({ json: {} });
  });

  await openTable(page);

  const row = page.getByRole("table").locator('tr[data-todo-id="todo-rutin"]');
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Titel")).toHaveCount(0);
  await expect(row.getByLabel("Syns från")).toHaveCount(0);
  await expect(row.getByLabel("Kategori")).toHaveCount(0);
  await expect(row.getByText("🔁")).toBeVisible();
  await expect(row.getByRole("button", { name: "Redigera Kvällsrutin i modal" })).toBeVisible();
});
