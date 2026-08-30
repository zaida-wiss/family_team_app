import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Familjevy (2026-08-30, Zaidas önskemål: "Välj familj på dashboarden skall
// flyttas till familj, där jag ska kunna välja vilka familjeanslutningar
// som skall visas i familjevyn" — uppföljt av "jag ska kunna vara ansluten
// till flera familjer, men själv aktivera och avaktivera") — ersätter det
// tidigare testet home-family-persist.spec.ts (den gamla "Välj familj"-
// popupen i Hem-vyn, som filtrerade till EN familj i taget, finns inte
// längre). Testar båda mekanismerna: Mina familjekonton
// (hiddenCrossAccountIds) och Familjeanslutningar (hiddenConnectionAccountIds).

async function openFamilyView(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Familj", exact: true }).click();
  await page.getByRole("button", { name: "Familjevy", exact: true }).click();
}

const MEMBERSHIPS = [
  { accountId: "acc-2", accountName: "Familjen Andersson", memberId: "mem-2", isCreator: false, memberCount: 2 }
];

const FULL_SCOPE = { todos: true, recipes: true, shoppingLists: true, calendars: true, birthdays: true };

const CONNECTIONS = {
  exposedByMe: [],
  exposedToMe: [
    {
      fromAccountId: "acc-9",
      fromAccountName: "Familjen Nilsson",
      exposedMemberIds: ["mem-9"],
      access: "view",
      dataScope: FULL_SCOPE
    }
  ]
};

test("Familjevy: avaktiverar ett eget familjekonto (Mina familjekonton)", async ({ page }) => {
  let patchBody: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/members/my-memberships", (route) => route.fulfill({ json: MEMBERSHIPS }));
  await page.route(`**/api/accounts/${MEMBER.accountId}/family-connections`, (route) =>
    route.fulfill({ json: { exposedByMe: [], exposedToMe: [] } })
  );
  await page.route(`**/api/accounts/${MEMBER.accountId}/family-connections/pending`, (route) =>
    route.fulfill({ json: [] })
  );
  await page.route(`**/api/members/${MEMBER.id}`, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  await openFamilyView(page);
  const row = page.locator("li", { hasText: "Familjen Andersson" });
  await expect(row.getByRole("checkbox")).toBeChecked();
  await row.getByRole("checkbox").uncheck();

  await expect.poll(() => patchBody).not.toBeNull();
  expect((patchBody as unknown as { hiddenCrossAccountIds: string[] }).hiddenCrossAccountIds).toEqual(["acc-2"]);
});

test("Familjevy: avaktiverar en familjeanslutning", async ({ page }) => {
  let patchBody: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/members/my-memberships", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/accounts/${MEMBER.accountId}/family-connections`, (route) =>
    route.fulfill({ json: CONNECTIONS })
  );
  await page.route(`**/api/accounts/${MEMBER.accountId}/family-connections/pending`, (route) =>
    route.fulfill({ json: [] })
  );
  await page.route(`**/api/members/${MEMBER.id}`, (route) => {
    if (route.request().method() === "PATCH") {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  await openFamilyView(page);
  const row = page.locator("li", { hasText: "Familjen Nilsson" });
  await expect(row.getByRole("checkbox")).toBeChecked();
  await row.getByRole("checkbox").uncheck();

  await expect.poll(() => patchBody).not.toBeNull();
  expect((patchBody as unknown as { hiddenConnectionAccountIds: string[] }).hiddenConnectionAccountIds).toEqual([
    "acc-9"
  ]);
});
