/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Import/export av inköpslistor via kalkylark (2026-07-28, Zaidas önskemål:
// "all data ska alltid gå att importera och exportera i de olika
// kategorierna i inställningar") — samma mönster som redan finns för
// todos/recept, en egen "Importera/exportera"-underkategori under Inköpslistor.

async function openImportExportSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Inköpslistor" }).click();
  await page.getByRole("button", { name: "📥 Importera/exportera" }).click();
}

test("Inköpslistor-import/export: laddar ner mallen med rätt rubriker", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await openImportExportSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Ladda ner mall (CSV)" }).click()
  ]);

  expect(download.suggestedFilename()).toBe("inkopslistor-mall.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8").replace(/^﻿/, "");
  expect(text.split(/\r?\n/)[0]).toBe("Lista,Vara,Klar");
});

test("Inköpslistor-import/export: importerar en CSV-fil, skapar en ny lista och en befintlig återanvänds", async ({ page }) => {
  const EXISTING_LIST = {
    id: "shop-existing", accountId: "acc-1", name: "Veckohandling", ownerId: "mem-1",
    color: "#2f7d6d", icon: null, sharedWith: [], deletedAt: null, deletedBy: null, items: []
  };
  const createdLists: Record<string, unknown>[] = [];
  const addedItems: { listId: string; title: string }[] = [];
  const toggledItemIds: string[] = [];

  await mockAuthAndData(page);
  await page.route("**/api/shopping", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [EXISTING_LIST] });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      createdLists.push(body);
      return route.fulfill({ status: 201, json: { id: body.id } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route(/\/api\/shopping\/[^/]+\/items$/, (route) => {
    const body = route.request().postDataJSON() as { title: string };
    const listId = route.request().url().split("/").slice(-2, -1)[0];
    addedItems.push({ listId, title: body.title });
    route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route(/\/api\/shopping\/[^/]+\/items\/[^/]+\/toggle$/, (route) => {
    toggledItemIds.push(route.request().url().split("/").slice(-2, -1)[0]);
    route.fulfill({ json: { ok: true } });
  });

  await openImportExportSettings(page);

  const csv = [
    "Lista,Vara,Klar",
    "Veckohandling,Mjölk,Nej",
    "Veckohandling,Ägg,Ja",
    "Fest,Läsk,Nej"
  ].join("\r\n");

  await page.getByLabel("Importera inköpslistor från CSV-fil").setInputFiles({
    name: "inkopslistor.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8")
  });

  await expect(page.getByText("3 varor importerade.")).toBeVisible();
  await expect.poll(() => addedItems.length).toBe(3);
  expect(addedItems.filter((i) => i.listId === "shop-existing").map((i) => i.title)).toEqual(["Mjölk", "Ägg"]);
  expect(createdLists).toHaveLength(1);
  expect(createdLists[0].name).toBe("Fest");
  expect(toggledItemIds).toHaveLength(1);
});
