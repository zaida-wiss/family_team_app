import { test, expect } from "@playwright/test";
import { mockDataAPIs, LOGIN_RESPONSE } from "./helpers";

// 2026-08-10, Zaidas önskemål: "Man ska kunna lägga till bild på sitt
// konto. Då får man automatiskt den bilden i de familjer man är med i, med
// möjlighet att byta bild inom varje familj." — kontonivå-avatar
// (User.avatarUrl), skild från en medlems egen per-familj-satta
// Member.avatarUrl (den senare har alltid företräde, orört av detta).
//
// Själva uppladdningsflödet (canvas-komprimering + ett riktigt anrop mot
// api.cloudinary.com) saknar redan etablerad e2e-mockning i den här svit­en
// — testar därför borttagnings-vägen (PATCH-anropet + UI-reaktionen), som
// verifierar samma wiring (route/prop-kedja/callback) utan att behöva bygga
// ny Cloudinary-mockningsinfrastruktur.

const USER_WITH_AVATAR = { ...LOGIN_RESPONSE.user, avatarUrl: "https://res.cloudinary.com/demo/image/upload/v1/avatars/abc.jpg" };
const LOGIN_RESPONSE_WITH_AVATAR = { ...LOGIN_RESPONSE, user: USER_WITH_AVATAR };

test("kontonivå-avatar visas i Inställningar och går att ta bort", async ({ page }) => {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE_WITH_AVATAR }));

  let patchBody: Record<string, unknown> | null = null;
  await page.route("**/api/auth/avatar", (route) => {
    patchBody = route.request().postDataJSON() as Record<string, unknown>;
    route.fulfill({ json: { user: { ...USER_WITH_AVATAR, avatarUrl: null } } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto", exact: true }).click();
  await page.getByRole("button", { name: "Konto", exact: true }).click();

  await expect(page.getByText("Din profilbild")).toBeVisible();
  await expect(page.locator(".account-setup__avatar-row img")).toBeVisible();

  await page.getByRole("button", { name: "Ta bort profilbild" }).click();

  expect(patchBody).toEqual({ avatarUrl: null });
  await expect(page.getByRole("button", { name: "Ta bort profilbild" })).not.toBeVisible();
  await expect(page.locator(".account-setup__avatar-row img")).not.toBeVisible();
});

test("ingen kontonivå-avatar satt: bara fallback-ikonen visas, ingen Ta bort-knapp", async ({ page }) => {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto", exact: true }).click();
  await page.getByRole("button", { name: "Konto", exact: true }).click();

  await expect(page.getByText("Din profilbild")).toBeVisible();
  await expect(page.locator(".account-setup__avatar-row img")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Ta bort profilbild" })).not.toBeVisible();
});
