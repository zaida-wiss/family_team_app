import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål) — en
// nedladdningsbar mall med samma rubriker som import/export förväntar sig,
// och ett CSV-importflöde i Inställningar.

async function openImportExportSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "📥 Importera/exportera uppgifter" }).click();
}

test("Todos-import/export: laddar ner mallen med rätt rubriker", async ({ page }) => {
  await mockAuthAndData(page);
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Ladda ner mall (CSV)" }).click()
  ]);

  expect(download.suggestedFilename()).toBe("todo-mall.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  expect(text.split(/\r?\n/)[0]).toBe(
    "Titel,Tilldelad,Kategori,Stjärnor,Startdatum,Slutdatum,Återkommer,Intervall,Veckodagar,Delmoment,Anteckningar"
  );
});

test("Todos-import/export: importerar en CSV-fil och skapar todos, inklusive en ny kategori", async ({ page }) => {
  const createdTodos: Record<string, unknown>[] = [];
  let createdCategoryName: string | null = null;

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
      const body = route.request().postDataJSON() as Record<string, unknown>;
      createdTodos.push(body);
      return route.fulfill({ status: 201, json: { id: body.id } });
    }
    return route.fulfill({ json: {} });
  });

  await openImportExportSettings(page);

  const csv = [
    "Titel,Tilldelad,Kategori,Stjärnor,Startdatum,Slutdatum,Anteckningar",
    "Handla mat,Mig själv,Hushåll,,,,Mjölk och bröd",
    ",,,,,,",
    "Diska,Okänd Person,,,,,"
  ].join("\r\n");

  // setInputFiles funkar direkt på det dolda <input type=file>-elementet —
  // ingen anledning att klicka den synliga knappen och hantera en riktig
  // filechooser-dialog i testmiljön. Ett generiskt input[type=file]-val
  // krockar med avatar-uppladdarens fil-input i samma Inställningar-panel,
  // därför getByLabel på den egna aria-label:en istället.
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "todos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect(page.getByText(/Okänd Person/)).toBeVisible();

  await expect.poll(() => createdCategoryName).toBe("Hushåll");
  await expect.poll(() => createdTodos.length).toBe(1);
  expect(createdTodos[0].title).toBe("Handla mat");
  expect(createdTodos[0].assignedTo).toBe("mem-1");
  expect(createdTodos[0].personalCategoryId).toBe("cat-new");
  expect(createdTodos[0].notes).toBe("Mjölk och bröd");
});

test("Todos-import/export: exporterar mina egna uppgifter som CSV", async ({ page }) => {
  const TODO = {
    id: "todo-1", accountId: "acc-1", title: "Min uppgift", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    routineCategory: null, personalCategoryId: null, notes: null
  };
  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO] }));
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportera mina uppgifter (CSV)" }).click()
  ]);

  expect(download.suggestedFilename()).toBe("mina-todos.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  expect(lines[1]).toBe("Min uppgift,Mig själv,,,,,,,,,");
});

// Zaida upptäckte 2026-07-05 att återkommande uppgifter tystnade helt ur
// exporten (todosToCsv exkluderade dem) — och bad om att återkommelse
// (enhet/intervall/veckodagar) ska rundtrippa via kalkylarket.
test("Todos-import/export: en återkommande uppgift (varannan vecka på mån+ons) rundtrippar via export och import", async ({ page }) => {
  const RECURRING_TODO = {
    id: "todo-1", accountId: "acc-1", title: "Träna", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" },
    recurrence: { type: "recurring", unit: "week", every: 2, daysOfWeek: ["monday", "wednesday"] },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: "2026-07-06T00:00:00.000Z", expiresAt: null,
    deletedAt: null, deletedBy: null, routineCategory: null, personalCategoryId: null, notes: null
  };
  let createdTodo: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [RECURRING_TODO] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportera mina uppgifter (CSV)" }).click()
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const exportedCsv = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  // Veckodagar-fältet innehåller själv ett kommatecken ("mån,ons") och blir
  // därför citerat av CSV-serialiseraren. Startdatum innehåller nu klockslag
  // — beräknat via lokala Date-getters, inte hårdkodat, eftersom "...T00:00:00.000Z"
  // visas som en annan lokal tid beroende på testmiljöns tidszon.
  const localStart = new Date(RECURRING_TODO.visibleFrom);
  const pad = (n: number) => String(n).padStart(2, "0");
  const expectedStart = `${localStart.getFullYear()}-${pad(localStart.getMonth() + 1)}-${pad(localStart.getDate())} ${pad(localStart.getHours())}:${pad(localStart.getMinutes())}`;
  expect(exportedCsv.split(/\r?\n/)[1]).toBe(`Träna,Mig själv,,,${expectedStart},,Vecka,2,"mån,ons",,`);

  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(exportedCsv, "utf-8")
  });

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect.poll(() => createdTodo?.title).toBe("Träna");
  expect(createdTodo?.recurrence).toEqual({
    type: "recurring",
    unit: "week",
    every: 2,
    daysOfWeek: ["monday", "wednesday"]
  });
});
