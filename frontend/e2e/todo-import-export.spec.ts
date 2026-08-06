/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

const CHILD_MEMBER = {
  id: "mem-child-1", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

// Import/export av todos via kalkylark (2026-07-05, Zaidas önskemål) — en
// nedladdningsbar mall med samma rubriker som import/export förväntar sig,
// och ett CSV-importflöde i Inställningar.

async function openImportExportSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Todo-lista" }).click();
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
  // 2026-08-03: Fler tidsrutor (Todo.timeWindows) + Slutar (RecurrenceEnd)
  // tillagda — tidsbegränsade återkommande uppgifter helt från kalkylark.
  // 2026-08-04: Radera tillagd — massradera via en ifylld kolumn i mallen.
  // 2026-08-05: Skapad/Ändrad tillagda — rent informativa, serverstyrda
  // revisionsstämplar (Todo.createdAt/updatedAt), aldrig lästa vid import.
  expect(text.split(/\r?\n/)[0]).toBe(
    "Titel,Emoji,Tilldelad,Egen kategori,Stjärnor,Timer,Timer (min),Startdatum,Slutdatum,Fler tidsrutor,Återkommer,Intervall,Veckodagar,Slutar,Delmoment,Anteckningar,Id,Skapad,Ändrad,Radera,Familj"
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
    "Titel,Tilldelad,Egen kategori,Stjärnor,Startdatum,Slutdatum,Anteckningar",
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

  // "Okänd Person" matchar ingen medlem i kontot — importen pausar och frågar
  // vem i familjen namnet menas (2026-07-07, Zaidas resonemang om att dela
  // listor mellan familjer), istället för att tyst hoppa över raden. Här
  // väljs "Hoppa över dessa rader" för att bevara testets ursprungliga syfte
  // (bara Handla mat ska importeras).
  await expect(page.getByText(/Okänd Person/)).toBeVisible();
  await page.getByLabel("Okänd Person").selectOption("Hoppa över dessa rader");
  await page.getByRole("button", { name: "Fortsätt importera" }).click();

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();

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
    personalCategoryId: null, notes: null
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
  // 2026-08-03: två nya tomma kolumner (Fler tidsrutor/Slutar) tillkom mellan
  // Slutdatum/Återkommer respektive Veckodagar/Delmoment. 2026-08-04: en ny
  // tom Radera-kolumn sist (aldrig förifylld vid export). 2026-08-05: Skapad/
  // Ändrad — TODO-fixturen saknar createdAt/updatedAt (gammal mock utan de
  // nya fälten), blir alltså tomma celler precis som en ej ommigrerad todo.
  expect(lines[1]).toBe(
    ["Min uppgift", "Star", "Mig själv", "", "", "", "", "", "", "", "", "", "", "", "", "", "todo-1", "", "", ""].join(",")
  );
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
    deletedAt: null, deletedBy: null, personalCategoryId: null, notes: null
  };
  // Exporten innehåller nu uppgiftens riktiga Id (2026-07-07, Zaidas önskemål
  // om uppdatering via export/import) — en re-import av samma fil matchar
  // därför mot den BEFINTLIGA uppgiften och skickar en PATCH, inte ett nytt
  // POST-anrop.
  let updatedPatch: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [RECURRING_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-1", (route) => {
    if (route.request().method() === "PATCH") {
      updatedPatch = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
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
  // 2026-08-03: två nya tomma kolumner (Fler tidsrutor/Slutar) tillkom mellan
  // Slutdatum/Återkommer respektive Veckodagar/Delmoment. 2026-08-04: en ny
  // tom Radera-kolumn sist (aldrig förifylld vid export). 2026-08-05: Skapad/
  // Ändrad — fixturen saknar createdAt/updatedAt, blir tomma celler.
  expect(exportedCsv.split(/\r?\n/)[1]).toBe(
    [
      "Träna", "Star", "Mig själv", "", "", "", "", expectedStart, "", "", "Vecka", "2", '"mån,ons"', "", "", "", "todo-1", "", "", ""
    ].join(",")
  );

  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(exportedCsv, "utf-8")
  });

  await expect(page.getByText("0 uppgifter importerade, 1 uppgift uppdaterade.")).toBeVisible();
  await expect.poll(() => updatedPatch?.title).toBe("Träna");
  expect(updatedPatch?.recurrence).toEqual({
    type: "recurring",
    unit: "week",
    every: 2,
    daysOfWeek: ["monday", "wednesday"]
  });
});

// 2026-07-07 (Zaidas önskemål: "skapa möjlighet att uppdatera todolistan med
// export och import") — en helt NY rad (Id matchar ingen befintlig todo)
// skapas fortfarande som vanligt.
test("Todos-import/export: en rad med ett okänt/tomt Id skapar en ny uppgift, rör inte befintliga", async ({ page }) => {
  const EXISTING = {
    id: "todo-existing", accountId: "acc-1", title: "Sedan tidigare", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let createdTodo: Record<string, unknown> | null = null;
  let patchCalled = false;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [EXISTING] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-existing", (route) => {
    patchCalled = true;
    return route.fulfill({ json: { ok: true } });
  });
  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Id", "Ny uppgift,Mig själv,"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect.poll(() => createdTodo?.title).toBe("Ny uppgift");
  expect(patchCalled).toBe(false);
});

// 2026-08-05, Zaidas fynd: "varför är det återigen så många dubletter för
// barnen?" — samma rutin importerad om och om igen (t.ex. en fil delad eller
// regenererad av ett externt verktyg, ofta utan Id-kolumnen ifylld) skapade
// tidigare en helt NY, exakt likadan mall vid VARJE import, istället för att
// känna igen den redan befintliga — en riktig dubblett (samma titel, SAMMA
// klockslag) byggdes på för varje ny import. En rad utan matchande Id
// matchas nu ÄVEN mot en redan befintlig mall med samma titel och samma
// klockslag (oavsett datum — mallar lever på ett oberoende ankardatum) innan
// den skapar en ny.
test("Todos-import/export: en rad utan matchande Id men samma titel+klockslag som en befintlig mall uppdaterar den, skapar ingen dubblett", async ({ page }) => {
  // Byggd via LOKAL tid (new Date utan "Z"), precis som CSV-parserns egen
  // dateTimeDisplayToISO — annars kan ett hårdkodat UTC-ankare (2000-01-01)
  // råka hamna på ett annat klockslag än "09:31" beroende på testmiljöns
  // tidszon, och matchningen missar av ett testfel, inte ett kodfel.
  const templateVisibleFrom = new Date("2000-01-01T09:31:00").toISOString();
  const templateExpiresAt = new Date("2000-01-01T13:00:00").toISOString();
  const EXISTING_TEMPLATE = {
    id: "todo-template-existing", accountId: "acc-1", title: "duka undan", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 1,
    visual: { type: "lucide-icon", value: "Star" },
    recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: templateVisibleFrom, expiresAt: templateExpiresAt,
    deletedAt: null, deletedBy: null, personalCategoryId: null, notes: null
  };
  // En separat, HELT LEGITIM POST kan hända oberoende av importen — klienten
  // genererar automatiskt dagens occurrence för den redan existerande,
  // förfallna mallen (samma bakgrundssynk som alltid körs). Den posten har
  // recurringSourceId satt till mallens id; en FELAKTIGT duplicerad NY MALL
  // hade istället haft recurringSourceId: null. Skiljer på de två istället
  // för att bara räkna "någon POST hände".
  let templatePostCreated = false;
  let patchedBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [EXISTING_TEMPLATE] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.recurringSourceId === null) templatePostCreated = true;
      return route.fulfill({ status: 201, json: { id: body.id } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-template-existing", (route) => {
    if (route.request().method() === "PATCH") {
      patchedBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await openImportExportSettings(page);

  // Nytt datum (2026, inte 2000) men SAMMA klockslag (09:31) och SAMMA titel
  // — precis det mönster ett omgenererat kalkylark ger, utan Id ifyllt.
  const csv = [
    "Titel,Tilldelad,Startdatum,Slutdatum,Återkommer,Intervall,Veckodagar",
    "duka undan,Mig själv,2026-08-05 09:31,2026-08-05 13:00,Dag,1,"
  ].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect.poll(() => patchedBody?.title).toBe("duka undan");
  expect(templatePostCreated).toBe(false);
});

// 2026-08-06, Zaidas fynd: "en uppgift som ändras via importera... skall
// inte rendera en ny, endast uppdatera befintlig" — en tidigare
// felkategoriserad Familjen-uppgift (personalCategoryId pekar på en
// PERSONLIG, inte en familje-, kategori) är osynlig i getFamilyViewTodos
// och därmed i den familje-scopade `todos`-propen — men matchningen mot en
// befintlig uppgift vid en omimport ska ändå hitta den (via den bredare
// allTodosForMatching-propen) och uppdatera, inte skapa ännu en dubblett.
test("Todos-import/export (familje-scope, Hem-vyn): en omimport hittar och uppdaterar en uppgift som är osynlig i familjevyn p.g.a. fel kategoriscope, skapar ingen dubblett", async ({ page }) => {
  const templateVisibleFrom = new Date("2000-01-01T18:00:00").toISOString();
  const templateExpiresAt = new Date("2000-01-01T23:55:00").toISOString();
  const PERSONAL_CATEGORY = {
    id: "cat-personal-1", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
    isFamily: false, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
  };
  const MISCATEGORIZED_TEMPLATE = {
    id: "todo-template-existing", accountId: "acc-1", title: "Kvällsrutiner", createdBy: "mem-1",
    assignedTo: null, isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" },
    recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: templateVisibleFrom, expiresAt: templateExpiresAt,
    deletedAt: null, deletedBy: null, personalCategoryId: "cat-personal-1", notes: null
  };
  let templatePostCreated = false;
  let patchedBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [PERSONAL_CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [MISCATEGORIZED_TEMPLATE] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.recurringSourceId === null) templatePostCreated = true;
      return route.fulfill({ status: 201, json: { id: body.id } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-template-existing", (route) => {
    if (route.request().method() === "PATCH") {
      patchedBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();
  // Uppgiften är felkategoriserad (personlig kategori, inte familjens) —
  // syns alltså aldrig som en bubbla i familjevyn, precis som buggen.
  await expect(page.getByText("Kvällsrutiner")).toHaveCount(0);

  await page.getByRole("button", { name: "Importera/exportera familjens uppgifter" }).click();
  const csv = [
    "Titel,Tilldelad,Startdatum,Slutdatum,Återkommer,Intervall,Veckodagar",
    "Kvällsrutiner,Familjen,2026-08-06 18:00,2026-08-06 23:55,Dag,1,"
  ].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect.poll(() => patchedBody?.title).toBe("Kvällsrutiner");
  expect(templatePostCreated).toBe(false);
});

// 2026-08-04, Zaidas önskemål: "jag behöver även en kolumn i mallen där kan
// kan radera uppgifter... ladda ner alla todos, uppdatera, lägga till nya
// och radera de jag inte vill ha kvar längre, sedan importera" — en rad med
// "Ja" i Radera-kolumnen och ett matchande Id raderar (mjukt) den befintliga
// uppgiften istället för att skapa/uppdatera den, i SAMMA import som vanliga
// skapa/uppdatera-rader.
test("Todos-import/export: en rad med Radera=Ja och ett matchande Id raderar uppgiften, andra rader skapas/uppdateras som vanligt", async ({ page }) => {
  const TO_DELETE = {
    id: "todo-delete-me", accountId: "acc-1", title: "Gammal uppgift", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let deletedId: string | null = null;
  let createdTodo: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TO_DELETE] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-delete-me", (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = "todo-delete-me";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await openImportExportSettings(page);

  const csv = [
    "Titel,Tilldelad,Id,Radera",
    "Gammal uppgift,Mig själv,todo-delete-me,Ja",
    "Ny uppgift,Mig själv,,"
  ].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("1 uppgift importerade, 1 uppgift raderade.")).toBeVisible();
  await expect.poll(() => deletedId).toBe("todo-delete-me");
  await expect.poll(() => createdTodo?.title).toBe("Ny uppgift");
});

test("Todos-import/export: Radera=Ja utan ett matchande Id visar ett tydligt fel, raderar ingenting", async ({ page }) => {
  let deleteCalled = false;
  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? [] : {} })
  );
  await page.route("**/api/todos/**", (route) => {
    if (route.request().method() === "DELETE") deleteCalled = true;
    return route.fulfill({ json: {} });
  });
  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Id,Radera", "Okänd uppgift,Mig själv,todo-finns-inte,Ja"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("0 uppgifter importerade.")).toBeVisible();
  await expect(page.getByText(/hittade ingen egen uppgift med Id/)).toBeVisible();
  expect(deleteCalled).toBe(false);
});

// 2026-08-05, Zaidas fynd: en stor massradering via Radera-kolumnen gav
// "net::ERR_INSUFFICIENT_RESOURCES" — onDeleteTodo anropades tidigare helt
// osynkroniserat (skicka-och-glöm), så en fil med många Radera=Ja-rader
// sköt iväg lika många parallella DELETE-anrop på en gång i en synkron
// loop, exakt samma buggklass som redan fixats för skapande/uppdatering
// 2026-08-04. Verifierar att rad 2:s DELETE inte skickas förrän rad 1:s
// svar faktiskt landat (sekventiellt, samma mönster som den redan
// existerande "en stor import väntar in varje rads POST"-testet).
test("Todos-import/export: flera Radera=Ja-rader raderas en i taget, inte alla samtidigt", async ({ page }) => {
  const makeTodo = (id: string, title: string) => ({
    id, accountId: "acc-1", title, createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  });
  const TODOS = [makeTodo("todo-a", "Uppgift A"), makeTodo("todo-b", "Uppgift B")];

  // Mäter TOPPEN av samtidiga in-flight DELETE-anrop direkt (istället för
  // att bara jämföra ankomstordning, som visade sig opålitligt — Playwrights
  // egen CDP-baserade route-hantering kan i sig introducera tillräcklig
  // fördröjning mellan två i praktiken SAMTIDIGT avfyrade anrop för att en
  // ordningsbaserad koll av misstag ska se "sekventiellt" ut även i den
  // trasiga, oväntade koden — en direkt räknare av hur många som var
  // PÅGÅENDE samtidigt är ett robustare, tidsoberoende mått).
  let inFlight = 0;
  let peakInFlight = 0;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: route.request().method() === "GET" ? TODOS : {} }));
  await page.route("**/api/todos/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fulfill({ json: {} });
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    // En liten, riktig fördröjning ger den trasiga (skicka-och-glöm) koden
    // gott om tid att hinna avfyra rad 2:s anrop INNAN rad 1:s svar landar,
    // om den skulle göra det — annars kunde ett race missas av en slump.
    await new Promise((resolve) => setTimeout(resolve, 100));
    inFlight--;
    return route.fulfill({ json: { ok: true } });
  });
  await openImportExportSettings(page);

  const csv = [
    "Titel,Tilldelad,Id,Radera",
    "Uppgift A,Mig själv,todo-a,Ja",
    "Uppgift B,Mig själv,todo-b,Ja"
  ].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("0 uppgifter importerade, 2 uppgifter raderade.")).toBeVisible();
  expect(peakInFlight).toBe(1);
});

// 2026-08-05, Zaidas fynd: "varför fungerar det inte att radera med hjälp av
// CSV-kolumnen?" — en allvarlig bugg i gårdagens fix (useTodosState.ts:s
// softDeleteTodo): om målet HITTADES men canDeleteTodo (shared/permissions.ts
// — kräver createdBy===mig ELLER canDeleteAnyTodos, INTE bara att uppgiften
// är tilldelad mig) blockerade raderingen, pushades inget nätverksanrop alls
// — Promise.all([]).every(Boolean) på en TOM array är sant via "vacuous
// truth", så funktionen ljög och rapporterade lyckat trots att NOLL rader
// faktiskt raderades. Verifierar att en uppgift skapad av NÅGON ANNAN (bara
// tilldelad mig, utan canDeleteAnyTodos) korrekt rapporteras som misslyckad
// — inte tyst räknad som raderad.
test("Todos-import/export: Radera=Ja på en uppgift jag INTE skapat (bara tilldelad mig, ingen canDeleteAnyTodos) rapporteras som misslyckad, inte tyst som lyckad", async ({ page }) => {
  const RESTRICTED_ROLE = {
    id: "role-restricted", name: "Utan raderingsbehörighet", isChildRole: false,
    permissions: {
      canManageMembers: false, canManageRoles: false, canSeeAllTodos: true, canSeeOwnTodos: true,
      canCreateTodos: true, canScheduleRecurringTodos: false, canCompleteAssignedTodos: true,
      canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false, canSeeAllCalendar: false,
      canSeeOwnCalendar: false, canCreateCalendar: false, canEditCalendar: false, canImportCalendar: false,
      canExportCalendar: false, canSeeShoppingLists: true, canCreateShoppingLists: false,
      canEditShoppingLists: false, canViewTrash: false, canRestoreFromTrash: false,
      canCreateChildAccounts: false, canManageChildTodos: false
    }
  };
  // Skapad av "mem-annan" — INTE av mig (mem-1) — men tilldelad mig, så den
  // syns i min vy och runImport:s egen (bredare) matchningsregel hittar den.
  const NOT_MY_TODO = {
    id: "todo-not-mine", accountId: "acc-1", title: "Skapad av någon annan", createdBy: "mem-annan",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let deleteCalled = false;

  await mockAuthAndData(page);
  // Registrerad EFTER mockAuthAndData (som redan satt upp en bredare
  // behörig roll) — ersätter den med en roll UTAN canDeleteAnyTodos.
  await page.route("**/api/roles", (route) => route.fulfill({ json: [RESTRICTED_ROLE] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [NOT_MY_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-not-mine", (route) => {
    if (route.request().method() === "DELETE") deleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });
  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Id,Radera", "Skapad av någon annan,Mig själv,todo-not-mine,Ja"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  // Behörigheten blockerar INNAN något nätverksanrop görs — matchar nu mot
  // canDeleteTodo redan i existing-uppslagningen (2026-08-05, samma dags
  // uppföljande fix), inte bara i onDeleteTodo/softDeleteTodo — så raden
  // hamnar i "hittade ingen"-grenen, inte "kunde inte raderas"-grenen.
  expect(deleteCalled).toBe(false);
  await expect(page.getByText("0 uppgifter importerade.")).toBeVisible();
  await expect(page.getByText(/Skapad av någon annan.*hittade ingen egen uppgift/)).toBeVisible();
});

// 2026-08-05, Zaidas fynd (uppföljning av testet ovan): en ADMIN med
// canDeleteAnyTodos/canEditAnyTodos kunde ändå inte radera/uppdatera en
// annan familjemedlems uppgift via CSV — existing-uppslagningen i
// TodoImportExport.tsx krävde tidigare ALLTID assignedTo===mig ELLER
// createdBy===mig, oavsett behörighet. Fixat till att återanvända
// canDeleteTodo/canEditTodo (samma funktion servern faktiskt kontrollerar).
// mockAuthAndData:s default-roll har redan canDeleteAnyTodos/canEditAnyTodos
// satta till true, så inget rollöverskrivande behövs här (till skillnad från
// testet ovan).
test("Todos-import/export: en admin med canDeleteAnyTodos kan radera en annan familjemedlems uppgift via CSV", async ({ page }) => {
  const NOT_MY_TODO = {
    id: "todo-not-mine", accountId: "acc-1", title: "Skapad av Lars", createdBy: "mem-lars",
    assignedTo: "mem-lars", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let deleteCalled = false;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [NOT_MY_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-not-mine", (route) => {
    if (route.request().method() === "DELETE") deleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });
  await openImportExportSettings(page);

  // "Mig själv" i Tilldelad-kolumnen (inte "Lars") — mockAuthAndData:s
  // standardmock har bara EN medlem, och deleteRow-grenen läser ändå aldrig
  // assignedTo (kortsluter innan den når fram) — det avgörande är att
  // NOT_MY_TODO:s createdBy är någon ANNAN, inte vad raden själv anger.
  const csv = ["Titel,Tilldelad,Id,Radera", "Skapad av Lars,Mig själv,todo-not-mine,Ja"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect.poll(() => deleteCalled).toBe(true);
  await expect(page.getByText("0 uppgifter importerade, 1 uppgift raderade.")).toBeVisible();
});

// Samma bugg fanns i uppdaterings-matchningen (canEditTodo istället för
// canDeleteTodo) — en admin kunde inte uppdatera en annan familjemedlems
// uppgift via ett matchande Id, skapade tyst en DUBBLETT istället.
test("Todos-import/export: en admin med canEditAnyTodos uppdaterar (inte duplicerar) en annan familjemedlems uppgift via CSV", async ({ page }) => {
  const NOT_MY_TODO = {
    id: "todo-not-mine", accountId: "acc-1", title: "Gammal titel", createdBy: "mem-lars",
    assignedTo: "mem-lars", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let patchedBody: Record<string, unknown> | null = null;
  let postCalled = false;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [NOT_MY_TODO] });
    if (route.request().method() === "POST") {
      postCalled = true;
      return route.fulfill({ status: 201, json: { id: "todo-should-not-be-created" } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-not-mine", (route) => {
    if (route.request().method() === "PATCH") {
      patchedBody = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await openImportExportSettings(page);

  // "Mig själv" (inte "Lars") — mockAuthAndData:s standardmock har bara EN
  // medlem, och Tilldelad-cellens värde här påverkar bara vad PATCH:en
  // sätter, inte om existing hittas (det avgörs av NOT_MY_TODO:s createdBy).
  const csv = ["Titel,Tilldelad,Id,Radera", "Ny titel,Mig själv,todo-not-mine,"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect.poll(() => patchedBody?.title).toBe("Ny titel");
  expect(postCalled).toBe(false);
  // "importerade" räknar bara NYSKAPADE rader (result.created) — en ren
  // uppdatering visar "0 uppgifter importerade, 1 uppgift uppdaterade."
  await expect(page.getByText("0 uppgifter importerade, 1 uppgift uppdaterade.")).toBeVisible();
});

// 2026-08-05, Zaidas fynd: en ny kategori skapad av en Familjen-tilldelad
// rad, via den PERSONLIGA importen (Inställningar, isFamilyScope=false),
// blev tidigare alltid en personlig kategori — 163 av hennes 176 Familjen-
// uppgifter var osynliga i familjevyn av just det skälet. Ny kategori
// skapad av en Familjen-rad ska bli en familjekategori även här.
test("Todos-import/export: en ny kategori skapad av en Familjen-rad (personlig import) blir en familjekategori, inte personlig", async ({ page }) => {
  let createdIsFamily: boolean | undefined;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { name: string; isFamily?: boolean };
      createdIsFamily = body.isFamily;
      return route.fulfill({
        status: 201,
        json: { id: "cat-new", accountId: "acc-1", memberId: "mem-1", name: body.name, isFamily: body.isFamily ?? false, createdAt: new Date().toISOString(), deletedAt: null, deletedBy: null }
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    return route.fulfill({ status: 201, json: { id: "todo-new" } });
  });
  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Egen kategori", "Städa köket,Familjen,Hushåll"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  expect(createdIsFamily).toBe(true);
});

// 2026-07-07 (Zaidas resonemang om att dela listor mellan familjer): ett
// okänt namn kan mappas till en RIKTIG medlem i importörens egen familj,
// istället för att bara hoppas över.
test("Todos-import/export: mappar ett okänt namn till en medlem i familjen, skapar uppgiften åt den medlemmen", async ({ page }) => {
  let createdTodo: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [{ id: "mem-1", accountId: "acc-1", userId: "user-1", name: "Testförälder", roleId: "role-1", isChild: false, avatarUrl: null, color: null, dashboardTheme: null, spentStars: 0, deletedAt: null, deletedBy: null }, CHILD_MEMBER] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      createdTodo = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: createdTodo.id } });
    }
    return route.fulfill({ json: {} });
  });
  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Stjärnor", "Städa rummet,Utländsk Unge,2"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText(/Utländsk Unge/)).toBeVisible();
  await page.getByLabel("Utländsk Unge").selectOption("Nova");
  await page.getByRole("button", { name: "Fortsätt importera" }).click();

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect.poll(() => createdTodo?.title).toBe("Städa rummet");
  expect(createdTodo?.assignedTo).toBe("mem-child-1");
  expect(createdTodo?.starValue).toBe(2);
});

// 2026-07-07 (Zaidas önskemål: "måste kunna välja vilka todolistor man vill
// dela när man exporterar. Alla, eller bara en eller några") — avmarkerar
// Barn-kryssrutan så barnens uppgifter INTE tas med i exporten.
test("Todos-import/export: avmarkerar Barn i exportfiltret utesluter barnens uppgifter", async ({ page }) => {
  const MY_TODO = {
    id: "todo-mine", accountId: "acc-1", title: "Min egen uppgift", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  const CHILD_TODO = {
    id: "todo-child", accountId: "acc-1", title: "Barnets uppgift", createdBy: "mem-1",
    assignedTo: "mem-child-1", isShared: false, status: "pending", starValue: 1,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [{ id: "mem-1", accountId: "acc-1", userId: "user-1", name: "Testförälder", roleId: "role-1", isChild: false, avatarUrl: null, color: null, dashboardTheme: null, spentStars: 0, deletedAt: null, deletedBy: null }, CHILD_MEMBER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [MY_TODO, CHILD_TODO] }));
  await openImportExportSettings(page);

  await page.getByRole("group", { name: "Vad ska exporteras?" }).getByLabel("Barn").uncheck();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportera mina uppgifter (CSV)" }).click()
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  const titles = text.split(/\r?\n/).slice(1).map((line) => line.split(",")[0]);

  expect(titles).toEqual(["Min egen uppgift"]);
});

// 2026-08-04, Zaidas önskemål: "se alla samlade todos som jag både kan visa
// och redigera utifrån mina behörigheter... den mallen ska jag först kunna
// exportera och sedan redigera raderna och sedan importera" — en samlad
// visa+redigera-tabell (mallar OCH engångsuppgifter, grupperat Barn/Övriga)
// ovanför export/import-knapparna, samma canSeeAllTodos-scopade
// getVisibleTodos-selector som Återkommande uppgifter/Engångsuppgifter redan
// använder.
test("Todos-import/export: en samlad tabell visar barnens och egna uppgifter, redigerbar och raderbar direkt", async ({ page }) => {
  const MY_TODO = {
    id: "todo-mine", accountId: "acc-1", title: "Handla mat", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  const CHILD_TODO = {
    id: "todo-child", accountId: "acc-1", title: "Läxor", createdBy: "mem-1",
    assignedTo: "mem-child-1", isShared: false, status: "pending", starValue: 1,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let deletedId: string | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [{ id: "mem-1", accountId: "acc-1", userId: "user-1", name: "Testförälder", roleId: "role-1", isChild: false, avatarUrl: null, color: null, dashboardTheme: null, spentStars: 0, deletedAt: null, deletedBy: null }, CHILD_MEMBER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [MY_TODO, CHILD_TODO] }));
  await page.route("**/api/todos/todo-mine", (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = "todo-mine";
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });
  await openImportExportSettings(page);

  const childGroup = page.getByRole("heading", { name: "👶 Barn" }).locator("..");
  await expect(childGroup.getByText("Läxor")).toBeVisible();
  const otherGroup = page.getByRole("heading", { name: "Övriga" }).locator("..");
  await expect(otherGroup.getByText("Handla mat")).toBeVisible();
  await expect(otherGroup.getByText("Läxor")).toHaveCount(0);

  await page.getByRole("button", { name: "Redigera Läxor" }).click();
  await expect(page.getByRole("dialog", { name: "Redigera uppgift" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Ta bort Handla mat" }).click();
  await expect.poll(() => deletedId).toBe("todo-mine");
});

// 2026-08-04, Zaidas önskemål: "i inställningar skall jag se todos som
// tillhör dess familjenamn... jag skall även kunna skapa todos därifrån till
// familjen, eller till flera familjer" — Mina familjekonton (genuint
// medlemskap, alltid skapningsbart) OCH Familjeanslutningar (bara om
// redigera-åtkomst) grupperade under sitt kontonamn.
test("Todos-import/export: andra familjer visas grupperat på kontonamn, går att skapa uppgifter i flera samtidigt", async ({ page }) => {
  const OTHER_FAMILY_TODO = {
    id: "todo-other", accountId: "acc-2", title: "Städa hos mormor", createdBy: "mem-x",
    assignedTo: null, isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "🧹" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let crossAccountPostBody: Record<string, unknown> | null = null;
  let connectionPostBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todos/family-across-accounts", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [{ accountId: "acc-2", accountName: "Familjen Andersson", myMemberId: "mem-x", todos: [OTHER_FAMILY_TODO], categoryNames: {} }]
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/family-across-accounts/acc-2", (route) => {
    crossAccountPostBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 201, json: { id: "todo-new-1" } });
  });
  await page.route("**/api/todos/connections", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: [{ accountId: "acc-3", accountName: "Familjen Berg", access: "edit", todos: [] }] });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/connections/acc-3", (route) => {
    connectionPostBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 201, json: { id: "todo-new-2" } });
  });
  await openImportExportSettings(page);

  await expect(page.getByRole("heading", { name: "Familjen Andersson" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Familjen Berg" })).toBeVisible();
  await expect(page.getByText("Städa hos mormor")).toBeVisible();

  await page.getByLabel("Titel på ny familjeuppgift").fill("Handla present");
  await page.getByLabel("Min egen familj").uncheck();
  await page.getByLabel("Familjen Andersson").check();
  await page.getByLabel("Familjen Berg").check();
  await page.getByRole("button", { name: "Lägg till" }).click();

  await expect.poll(() => crossAccountPostBody?.title).toBe("Handla present");
  await expect.poll(() => connectionPostBody?.title).toBe("Handla present");
});

// 2026-07-08 (Zaidas önskemål efter att ha ångrat en import: "vi behöver en
// knapp för att ångra senaste import") — en NYSKAPAD uppgift tas bort (mjukt)
// om man ångrar.
test("Todos-import/export: 'Ångra senaste import' tar bort en nyskapad uppgift", async ({ page }) => {
  let createdTodo: Record<string, unknown> | null = null;
  let deletedId: string | null = null;

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
  await page.route(/\/api\/todos\/todo-.*/, (route) => {
    if (route.request().method() === "DELETE") {
      deletedId = route.request().url().split("/").pop() ?? null;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Id", "Ny uppgift,Mig själv,"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect.poll(() => createdTodo?.id).not.toBeUndefined();

  await page.getByRole("button", { name: "Ångra senaste import" }).click();
  await expect.poll(() => deletedId).toBe(createdTodo?.id as string);
});

// 2026-08-04, Zaidas fynd: "kvällsrutiner och tvätt blir dubletter" efter
// Ångra senaste import → ny import i snabb följd. Grundorsaken: skapande-
// anropen var "skicka och glöm" (aldrig inväntade), så ett snabbt Ångra-
// klick kunde skicka sin radering INNAN skapandet ens hunnit sparas på
// servern — raderingen missade sitt mål, uppgiften "återuppstod" vid nästa
// hämtning. Verifierar att POST för rad 2 inte skickas förrän POST för rad
// 1 faktiskt svarat (sekventiellt, inte parallellt/skicka-och-glöm).
test("Todos-import/export: en stor import väntar in varje rads POST innan nästa påbörjas (ingen skicka-och-glöm-race)", async ({ page }) => {
  const postOrder: string[] = [];
  let resolveFirstPost: (() => void) | null = null;
  const firstPostStarted = new Promise<void>((resolve) => {
    resolveFirstPost = resolve;
  });

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { title: string };
      postOrder.push(body.title);
      if (body.title === "Kvällsrutiner") {
        resolveFirstPost?.();
        // Fördröjd svar — om rad 2:s POST skickas INNAN denna hunnit svara
        // (den gamla skicka-och-glöm-buggen) skulle postOrder redan
        // innehålla "Tvätt" när vi kollar det nedan.
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return route.fulfill({ status: 201, json: { id: `todo-${body.title}` } });
    }
    return route.fulfill({ json: {} });
  });

  await openImportExportSettings(page);

  const csv = [
    "Titel,Tilldelad,Id",
    "Kvällsrutiner,Mig själv,",
    "Tvätt,Mig själv,"
  ].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await firstPostStarted;
  // Precis efter att första POST:en skickats (men INNAN dess 300ms-fördröjda
  // svar), ska den andra raden ännu INTE ha skickat sin POST.
  expect(postOrder).toEqual(["Kvällsrutiner"]);

  await expect(page.getByText("2 uppgifter importerade.")).toBeVisible();
  expect(postOrder).toEqual(["Kvällsrutiner", "Tvätt"]);
});

// 2026-08-04, Zaidas fynd: en stor import verkade lyckas (kategorin skapades)
// men uppgifterna syntes aldrig — grundorsak: ett misslyckat POST-svar
// tystades helt (`.catch(console.error)`), räknades ändå som "skapad".
// createTodo/updateTodo avslöjar nu lyckat/misslyckat, och runImport räknar
// inte en misslyckad rad som skapad — den får ett tydligt fel i resultatet
// istället, så en riktig server-misslyckning aldrig ser ut att ha lyckats.
test("Todos-import/export: en rad vars POST misslyckas räknas inte som skapad, ger ett tydligt fel", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { title: string };
      if (body.title === "Trasig rad") {
        return route.fulfill({ status: 500, json: { error: "Serverfel" } });
      }
      return route.fulfill({ status: 201, json: { id: `todo-${body.title}` } });
    }
    return route.fulfill({ json: {} });
  });

  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Id", "Trasig rad,Mig själv,", "Fungerande rad,Mig själv,"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  // Bara EN rad lyckades faktiskt sparas — den trasiga räknas inte med.
  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect(page.getByText(/Trasig rad.*kunde inte sparas/)).toBeVisible();
});

// 2026-07-08 (Zaidas fynd: "ångra senaste import måste vara kvar även om jag
// växlar vy, eftersom jag behöver upptäcka eventuella fel") — resultatet och
// Ångra-knappen låg tidigare som lokal state i TodoImportExport.tsx, vilket
// nollställdes av Shell.tsx:s <ErrorBoundary key={activePanel}> så fort man
// navigerade bort från Inställningar och tillbaka. Ligger nu i useTodosState.
test("Todos-import/export: importresultatet och Ångra-knappen ligger kvar efter ett panelbyte", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    if (route.request().method() === "POST") return route.fulfill({ status: 201, json: { id: "todo-x" } });
    return route.fulfill({ json: {} });
  });

  await openImportExportSettings(page);

  const csv = ["Titel,Tilldelad,Id", "Ny uppgift,Mig själv,"].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });
  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ångra senaste import" })).toBeVisible();

  // Byt till en annan panel och tillbaka till Inställningar.
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Todo-lista" }).click();
  await page.getByRole("button", { name: "📥 Importera/exportera uppgifter" }).click();

  await expect(page.getByText("1 uppgift importerade.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ångra senaste import" })).toBeVisible();
});

// 2026-07-08 — en UPPDATERAD uppgift återställs till sina tidigare värden om
// man ångrar, inte bara raderas (den fanns redan innan importen).
test("Todos-import/export: 'Ångra senaste import' återställer en uppdaterad uppgift till tidigare värden", async ({ page }) => {
  const EXISTING = {
    id: "todo-existing", accountId: "acc-1", title: "Gammal titel", createdBy: "mem-1",
    assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: "Gamla anteckningar"
  };
  const patches: Record<string, unknown>[] = [];

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [EXISTING] }));
  await page.route("**/api/todos/todo-existing", (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {} });
  });

  await openImportExportSettings(page);

  const csv = [
    "Titel,Tilldelad,Anteckningar,Id",
    "Ny titel,Mig själv,Nya anteckningar,todo-existing"
  ].join("\r\n");
  await page.getByLabel("Importera CSV-fil").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("0 uppgifter importerade, 1 uppgift uppdaterade.")).toBeVisible();
  await expect.poll(() => patches[0]?.title).toBe("Ny titel");

  await page.getByRole("button", { name: "Ångra senaste import" }).click();
  await expect.poll(() => patches[1]?.title).toBe("Gammal titel");
  expect(patches[1]?.notes).toBe("Gamla anteckningar");
});
