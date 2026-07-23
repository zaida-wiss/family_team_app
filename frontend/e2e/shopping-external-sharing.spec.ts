import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Dela en inköpslista med en annan familj, icke-transitivt (ADR-0026,
// 2026-07-23, Zaidas önskemål: "även shoppinglistor skall kunna delas
// mellan olika familjer och mellan olika familjemedlemmar" — delning MELLAN
// familjemedlemmar inom samma konto fanns redan, ADR-0026 lägger till
// delning MELLAN familjer). Samma två flöden som child-sharing.spec.ts
// (ADR-0024): (1) Inställningar → Inköpslistor → "Dela med annan familj":
// sök en vuxen via e-post, ge access, se delningen, återkalla den.
// (2) Inköp-panelen: ett tillagt kort per lista NÅGON ANNAN delat med mig,
// med ett låst (endast visning) läge när access är "view".

const LIST = {
  id: "shop-1", name: "Veckohandling", ownerId: "mem-1", color: "#2f7d6d", icon: null,
  sharedWith: [], externalSharedWith: [], deletedAt: null, deletedBy: null, items: []
};

async function openInkopslistorSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Inköpslistor" }).click();
}

test("Dela med annan familj: söker en vuxen via e-post, ger åtkomst, ser delningen, återkallar den", async ({ page }) => {
  let shares: Record<string, unknown>[] = [];
  let shareBody: Record<string, unknown> | null = null;
  let revoked = false;

  await mockAuthAndData(page);
  await page.route("**/api/shopping", (route) => route.fulfill({ json: [LIST] }));
  await page.route("**/api/shopping/shared-lists", (route) => route.fulfill({ json: [] }));

  await page.route("**/api/shopping/*/external-share/lookup", (route) => {
    const body = route.request().postDataJSON();
    if (body.email === "annan-familj@exempel.se") {
      return route.fulfill({
        json: {
          memberships: [
            { memberId: "mem-other", accountId: "acc-2", memberName: "Erik", accountName: "Familjen Andersson" }
          ]
        }
      });
    }
    return route.fulfill({ json: { memberships: [] } });
  });

  await page.route("**/api/shopping/*/external-share", (route) => {
    if (route.request().method() === "POST") {
      shareBody = route.request().postDataJSON();
      shares = [
        {
          memberId: "mem-other", accountId: "acc-2", access: shareBody!.access,
          grantedBy: "mem-1", grantedAt: "2026-07-23T10:00:00.000Z"
        }
      ];
      return route.fulfill({ status: 201, json: shares });
    }
    return route.fulfill({ json: shares });
  });

  await page.route("**/api/shopping/*/external-share/*/*", (route) => {
    revoked = true;
    shares = [];
    return route.fulfill({ json: { ok: true } });
  });

  await openInkopslistorSettings(page);

  await page.getByRole("button", { name: "Dela med annan familj" }).click();
  await page.getByLabel("E-post till en vuxen").fill("annan-familj@exempel.se");
  await page.getByRole("button", { name: "Sök" }).click();

  const candidateRow = page.getByText("Erik (Familjen Andersson)").locator("..");
  await expect(candidateRow).toBeVisible();
  await page.getByLabel("Åtkomst").selectOption("edit");
  await candidateRow.getByRole("button", { name: "Dela" }).click();

  await expect.poll(() => shareBody).not.toBeNull();
  expect(shareBody!.granteeMemberId).toBe("mem-other");
  expect(shareBody!.granteeAccountId).toBe("acc-2");
  expect(shareBody!.access).toBe("edit");

  await expect(page.getByText("Kan redigera")).toBeVisible();

  await page.getByRole("button", { name: "Ta bort delning" }).click();
  await expect.poll(() => revoked).toBe(true);
  await expect(page.getByText("Kan redigera")).not.toBeVisible();
});

test("Inköp-panelen: ett delat listkort visas med endast-visning-läge när access är 'view'", async ({ page }) => {
  const SHARED_ITEM = { id: "item-1", title: "Mjölk", createdBy: "mem-other-parent", done: false, deletedAt: null, deletedBy: null };

  await mockAuthAndData(page);
  await page.route("**/api/shopping", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping/shared-lists", (route) =>
    route.fulfill({
      json: [
        {
          list: { id: "shop-other-1", accountId: "acc-2", name: "Annans familjelista", color: "#a855f7", icon: null, items: [SHARED_ITEM] },
          access: "view"
        }
      ]
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();

  await expect(page.getByText("Annans familjelista")).toBeVisible();
  await expect(page.getByText("Mjölk")).toBeVisible();
  // Lock-ikonens aria-label — CSS-modulklassen är hashad vid bygge, så en
  // attributselektor används istället för en klass-baserad lokator (samma
  // begränsning skulle gälla ett CSS-modul-scopat klassnamn i ett test).
  await expect(page.locator('[aria-label="Endast visning"]')).toBeVisible();
  await expect(page.getByLabel("Mjölk")).toBeDisabled();
});

test("Inköp-panelen: lägger till en vara i en delad lista med edit-åtkomst", async ({ page }) => {
  let addedItem: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/shopping", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping/shared-lists", (route) =>
    route.fulfill({
      json: [
        {
          list: { id: "shop-other-2", accountId: "acc-2", name: "Delad lista", color: "#a855f7", icon: null, items: [] },
          access: "edit"
        }
      ]
    })
  );
  await page.route("**/api/shopping/shared/acc-2/shop-other-2/items", (route) => {
    addedItem = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inköp" }).click();

  await expect(page.getByText("Delad lista")).toBeVisible();
  await page.getByPlaceholder("Lägg till vara").fill("Ost");
  await page.getByRole("button", { name: "Lägg till vara" }).click();

  await expect.poll(() => addedItem?.title).toBe("Ost");
  expect(addedItem?.createdBy).toBe(MEMBER.id);
});
