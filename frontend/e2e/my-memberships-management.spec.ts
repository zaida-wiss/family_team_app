import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Mina familjekonton, utökad (2026-07-29, Zaidas önskemål: "jag behöver
// även kunna radera familjer som jag skapat och se vilka som ingår i den,
// samt välja att överlåta den till någon annan familjemedlem, samt gå ur
// familjen"). Testar tre nya förmågor: se medlemmar, gå ur en familj man
// inte skapat, överlåta ägarskap i en familj man skapat.

async function openMyMemberships(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Familj", exact: true }).click();
  await page.getByRole("button", { name: "Mina familjekonton", exact: true }).click();
}

const MEMBERSHIPS = [
  { accountId: "acc-2", accountName: "Familjen Andersson", memberId: "mem-2", isCreator: false, memberCount: 2 },
  { accountId: "acc-3", accountName: "Familjen Bergström", memberId: "mem-3", isCreator: true, memberCount: 2 }
];

test("Mina familjekonton: kan se vilka som ingår i en familj", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members/my-memberships", (route) => route.fulfill({ json: MEMBERSHIPS }));
  await page.route("**/api/accounts/acc-2/members", (route) =>
    route.fulfill({ json: [{ id: "mem-2", name: "Erik", avatarUrl: null, color: null, isChild: false }] })
  );

  await openMyMemberships(page);
  await page
    .locator("li", { hasText: "Familjen Andersson" })
    .getByRole("button", { name: "Visa medlemmar" })
    .click();
  await expect(page.getByText("Erik")).toBeVisible();
});

test("Mina familjekonton: går ur en familj man inte skapat", async ({ page }) => {
  let leaveCalled = false;
  await mockAuthAndData(page);
  await page.route("**/api/members/my-memberships", (route) => route.fulfill({ json: MEMBERSHIPS }));
  await page.route("**/api/accounts/acc-2/leave", (route) => {
    leaveCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await openMyMemberships(page);
  const row = page.locator("li", { hasText: "Familjen Andersson" });
  await row.getByRole("button", { name: "Gå ur familjen" }).click();
  await row.getByRole("button", { name: "Bekräfta, gå ur" }).click();

  await expect.poll(() => leaveCalled).toBe(true);
});

test("Mina familjekonton: överlåter ägarskap i en familj man skapat", async ({ page }) => {
  let transferBody: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/members/my-memberships", (route) => route.fulfill({ json: MEMBERSHIPS }));
  await page.route("**/api/accounts/acc-3/members", (route) =>
    route.fulfill({
      json: [
        { id: "mem-3", name: MEMBER.name, avatarUrl: null, color: null, isChild: false },
        { id: "mem-4", name: "Sara", avatarUrl: null, color: null, isChild: false }
      ]
    })
  );
  await page.route("**/api/accounts/acc-3/transfer-ownership", (route) => {
    transferBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });

  await openMyMemberships(page);
  const row = page.locator("li", { hasText: "Familjen Bergström" });
  await row.getByRole("button", { name: "Visa medlemmar" }).click();
  await expect(row.getByLabel("Medlemmar i Familjen Bergström").getByText("Sara")).toBeVisible();

  await row.getByLabel("Ny ägare av Familjen Bergström").selectOption({ label: "Sara" });
  await row.getByRole("button", { name: "Överlåt ägarskap" }).click();
  await row.getByRole("button", { name: "Bekräfta överlåtelse" }).click();

  await expect.poll(() => transferBody).not.toBeNull();
  expect((transferBody as unknown as { newOwnerMemberId: string }).newOwnerMemberId).toBe("mem-4");
});

// 2026-07-30, Zaidas fynd: "jag trycker på Bekräfta radering, men den
// försvinner inte" — getMyMemberships filtrerade tidigare inte bort ett
// precis raderat konto (backend-fixen är separat testad i
// membershipManagement.integration.test.ts) — det här testet verifierar
// att RADEN faktiskt försvinner ur listan efter en lyckad radering, den
// synliga bekräftelsen användaren efterfrågade.
test("Mina familjekonton: raden försvinner ur listan efter en lyckad radering", async ({ page }) => {
  let deleted = false;
  await mockAuthAndData(page);
  await page.route("**/api/members/my-memberships", (route) =>
    route.fulfill({ json: deleted ? MEMBERSHIPS.filter((m) => m.accountId !== "acc-3") : MEMBERSHIPS })
  );
  await page.route("**/api/accounts/acc-3/as-creator", (route) => {
    deleted = true;
    return route.fulfill({ json: { ok: true } });
  });

  await openMyMemberships(page);
  const row = page.locator("li", { hasText: "Familjen Bergström" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Radera familjen" }).click();
  await row.getByRole("button", { name: "Bekräfta radering" }).click();

  await expect(page.locator("li", { hasText: "Familjen Bergström" })).toHaveCount(0);
});
