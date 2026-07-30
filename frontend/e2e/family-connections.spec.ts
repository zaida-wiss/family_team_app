import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Familjeanslutningar (ADR-0030, 2026-07-29) — den LÄTTA formen ("bara
// familjemedlemmar"), skiljer sig från Dela barn (ett helt barn) och Mina
// familjekonton (ett riktigt medlemskap). Testar Inställningar-flödet: sök
// en familj via e-post, välj vilka egna medlemmar som exponeras, skicka
// inbjudan.

async function openFamilyConnections(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Familj", exact: true }).click();
  await page.getByRole("button", { name: "Familjeanslutningar", exact: true }).click();
}

test("Familjeanslutningar: söker en familj via e-post, väljer medlemmar, skickar inbjudan", async ({ page }) => {
  let inviteBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/accounts/*/family-connections", (route) => {
    if (route.request().method() === "POST") {
      inviteBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fulfill({ json: { exposedByMe: [], exposedToMe: [] } });
  });
  await page.route("**/api/accounts/*/family-connections/pending", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/accounts/*/family-connections/lookup", (route) => {
    const body = route.request().postDataJSON() as { email: string };
    if (body.email === "annan-familj@exempel.se") {
      return route.fulfill({ json: { accounts: [{ accountId: "acc-2", accountName: "Familjen Andersson" }] } });
    }
    return route.fulfill({ json: { accounts: [] } });
  });

  await openFamilyConnections(page);

  await page.getByLabel("E-post till en vuxen i den andra familjen").fill("annan-familj@exempel.se");
  await page.getByRole("button", { name: "Sök" }).click();

  await expect(page.getByText("Familjen Andersson")).toBeVisible();

  await page.getByRole("button", { name: MEMBER.name }).click();
  await page.getByRole("button", { name: "Skicka inbjudan" }).click();

  await expect.poll(() => inviteBody).not.toBeNull();
  expect((inviteBody as unknown as { otherAccountId: string }).otherAccountId).toBe("acc-2");
  expect((inviteBody as unknown as { exposedMemberIds: string[] }).exposedMemberIds).toEqual([MEMBER.id]);
  expect((inviteBody as unknown as { access: string }).access).toBe("view");
});

test("Familjeanslutningar: visar en väntande inbjudan och accepterar den med mina egna val", async ({ page }) => {
  let acceptBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/accounts/*/family-connections/pending/*/accept", (route) => {
    acceptBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/accounts/*/family-connections/pending", (route) =>
    route.fulfill({
      json: [
        {
          connectionId: "famconn-1",
          fromAccountId: "acc-2",
          fromAccountName: "Familjen Andersson",
          exposedMemberCount: 1,
          access: "view",
          dataScope: { todos: true, recipes: true, shoppingLists: true }
        }
      ]
    })
  );
  await page.route("**/api/accounts/*/family-connections", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { exposedByMe: [], exposedToMe: [] } });
    }
    return route.fulfill({ json: { ok: true } });
  });

  await openFamilyConnections(page);

  await expect(page.getByText("Familjen Andersson")).toBeVisible();
  await page.getByRole("button", { name: MEMBER.name }).click();
  await page.getByRole("button", { name: "Acceptera" }).click();

  await expect.poll(() => acceptBody).not.toBeNull();
  expect((acceptBody as unknown as { exposedMemberIds: string[] }).exposedMemberIds).toEqual([MEMBER.id]);
});
