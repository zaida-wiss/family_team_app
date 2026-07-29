/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Import/export av Medaljer/Rekord-uppgifter via kalkylark (2026-07-29, del
// av Zaidas önskemål "all data ska alltid gå att importera och exportera i
// de olika kategorierna i inställningar") — samma mönster som redan finns
// för todos/recept/inköpslistor/belöningar.

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null
};

const CHILD = {
  id: "mem-2", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-1", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null
};

async function openImportExportSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "📥 Importera/exportera Medaljer/Rekord" }).click();
}

test("Medaljer/Rekord-import/export: laddar ner mallen med rätt rubriker", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [] }));
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Ladda ner mall (CSV)" }).click()
  ]);

  expect(download.suggestedFilename()).toBe("medaljer-rekord-mall.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  expect(text.split(/\r?\n/)[0]).toBe("Titel,Emoji,Barn");
});

test("Medaljer/Rekord-import/export: exporterar befintliga uppgifter med barnets namn", async ({ page }) => {
  const TASK = { id: "tt-1", title: "Spring ett varv", symbol: "🏃", assignedTo: "mem-2", createdBy: "mem-1", deletedAt: null, deletedBy: null };
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [TASK] }));
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportera uppgifter (CSV)" }).click()
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  expect(text.trim().split(/\r?\n/)[1]).toBe("Spring ett varv,🏃,Nova");
});

test("Medaljer/Rekord-import/export: importerar nya uppgifter, hoppar över okänt barn", async ({ page }) => {
  const created: Record<string, unknown>[] = [];
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/timed-tasks", (route) => {
    if (route.request().method() === "POST") {
      created.push(JSON.parse(route.request().postData() ?? "{}"));
      return route.fulfill({ status: 201, json: { id: `tt-${created.length}` } });
    }
    return route.fulfill({ json: [] });
  });

  await openImportExportSettings(page);

  const csv = [
    "Titel,Emoji,Barn",
    "Hoppa rep,🤾,Nova",
    "Simma,🏊,Okänt Barn"
  ].join("\r\n");

  await page.getByLabel("Importera Medaljer/Rekord-uppgifter från CSV-fil").setInputFiles({
    name: "medaljer.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText(/1 nya uppgifter\. 1 rad\(er\) hoppades över/)).toBeVisible();
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toMatchObject({ title: "Hoppa rep", symbol: "🤾", assignedTo: "mem-2" });
});
