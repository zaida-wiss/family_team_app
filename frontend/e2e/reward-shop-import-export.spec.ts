/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Import/export av belöningsbutikens katalog via kalkylark (2026-07-29, del
// av Zaidas önskemål "all data ska alltid gå att importera och exportera i
// de olika kategorierna i inställningar") — samma mönster som redan finns
// för todos/recept/inköpslistor, en egen "Importera/exportera"-underkategori
// under Barn (sida vid sida med Belöningsbutiken, inte nästlad under den).

const CATEGORY = {
  id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Hälsa",
  createdAt: "2026-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null
};

async function openImportExportSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "📥 Importera/exportera belöningar" }).click();
}

test("Belöningsbutiken-import/export: laddar ner mallen med rätt rubriker", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Ladda ner mall (CSV)" }).click()
  ]);

  expect(download.suggestedFilename()).toBe("belonings-mall.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  expect(text.split(/\r?\n/)[0]).toBe("Titel,Emoji,Stjärnkostnad,Timer (min),Kategorier,Id");
});

test("Belöningsbutiken-import/export: exporterar befintliga belöningar med kategorinamn", async ({ page }) => {
  const ITEM = {
    id: "reward-1", title: "Bio", symbol: "🎬", starCost: 50, timerMinutes: 120,
    availability: null, requiredCategories: ["cat-1"], createdBy: "mem-1", deletedAt: null
  };
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [ITEM], requireApprovalForCategories: false } })
  );
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportera belöningar (CSV)" }).click()
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  const lines = text.trim().split(/\r?\n/);
  expect(lines[1]).toBe("Bio,🎬,50,120,Hälsa,reward-1");
});

test("Belöningsbutiken-import/export: importerar en ny belöning och uppdaterar en befintlig via Id", async ({ page }) => {
  const EXISTING = {
    id: "reward-existing", title: "Gammal titel", symbol: null, starCost: 5, timerMinutes: null,
    availability: null, requiredCategories: [], createdBy: "mem-1", deletedAt: null
  };
  const addedItems: Record<string, unknown>[] = [];
  const updatedItems: { id: string; patch: Record<string, unknown> }[] = [];

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [EXISTING], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/items$/, (route) => {
    addedItems.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route(/\/api\/reward-shop\/items\/reward-existing$/, (route) => {
    updatedItems.push({ id: "reward-existing", patch: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });

  await openImportExportSettings(page);

  const csv = [
    "Titel,Emoji,Stjärnkostnad,Timer (min),Kategorier,Id",
    "Ny belöning,🍬,15,,Hälsa,",
    "Uppdaterad titel,,8,,,reward-existing"
  ].join("\r\n");

  await page.getByLabel("Importera belöningar från CSV-fil").setInputFiles({
    name: "belöningar.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("1 nya, 1 uppdaterade.")).toBeVisible();
  await expect.poll(() => addedItems.length).toBe(1);
  expect(addedItems[0].title).toBe("Ny belöning");
  expect(addedItems[0].requiredCategories).toEqual(["cat-1"]);
  await expect.poll(() => updatedItems.length).toBe(1);
  expect(updatedItems[0].patch.title).toBe("Uppdaterad titel");
  expect(updatedItems[0].patch.starCost).toBe(8);
});
