import { test, expect } from "@playwright/test";

// Zaida (2026-07-23): "Vi behöver även ha ett darkmode (fortfarande samma
// tema, men med omvänd färgordning, ljusa färger byter plats med mörka)".
// Bara vuxenteman (barnens teman är redan livliga/fasta, oberörda). En
// oberoende på/av-växel ovanpå dashboardTheme (Member.darkMode), inte en
// egen temaidentitet — c0…c7/on-c0…on-c7 speglas per tema (c0↔c7 osv,
// samma par-princip som redan fanns), bakgrund/kort/text/kant deriveras
// generiskt ur temats egen --primary (mixat mot svart istället för vitt).
//
// Två riktiga buggar hittades och fixades under arbetet, inte bara
// designval: (1) flera delade ytor (.text-input, .theme-picker,
// .settings-member-row m.fl.) hade hårdkodad vit bakgrund istället för
// var(--card) — förblev vita i mörkt läge. (2) .app-shell saknade en egen
// color-deklaration, så ett bart <h2> (utan egen color-regel) ärvde :root:s
// redan uträknade LJUSA textfärg rakt igenom istället för att omvärderas
// mot det mörka lägets --foreground — nästan osynlig text mot en mörk
// bakgrund. Båda fixade i samma commit som den här testfilen.

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
const ROLE = {
  id: "role-1", name: "Förälder", isChildRole: false,
  permissions: {
    canManageMembers: true, canManageRoles: true, canSeeAllTodos: true, canSeeOwnTodos: true, canCreateTodos: true,
    canScheduleRecurringTodos: true, canCompleteAssignedTodos: true, canEditAnyTodos: true, canDeleteAnyTodos: true,
    canApproveTodos: true, canSeeAllCalendar: true, canSeeOwnCalendar: true, canCreateCalendar: true,
    canEditCalendar: true, canImportCalendar: true, canExportCalendar: true, canSeeShoppingLists: true,
    canCreateShoppingLists: true, canEditShoppingLists: true, canViewTrash: true, canRestoreFromTrash: true,
    canCreateChildAccounts: true, canManageChildTodos: true,
  },
};
const CHILD_ROLE = { ...ROLE, id: "role-child", name: "Barn", isChildRole: true };
const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1", name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null,
};
const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null, name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: "space", approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "tok", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

function luminance([r, g, b]: number[]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function contrast(a: number[], b: number[]) {
  const la = luminance(a);
  const lb = luminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) => route.fulfill({ json: { items: [], requireApprovalForCategories: false } }));
  await page.route(/\/api\/reward-shop\/purchased/, (route) => route.fulfill({ json: [] }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));
}

async function toPixel(page: import("@playwright/test").Page, cssColor: string): Promise<number[]> {
  return page.evaluate((value) => {
    const box = document.createElement("div");
    box.style.color = value;
    document.body.appendChild(box);
    const resolved = getComputedStyle(box).color;
    box.remove();
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = resolved;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  }, cssColor);
}

test("Mörkt läge: växeln finns bara för vuxenteman, sätter dark-mode-klassen, och rensas för barn", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto & familj" }).click();
  await page.getByRole("button", { name: "Utseende" }).click();

  await expect(page.locator(".theme-dark-mode-toggle")).toBeVisible();

  const shell = page.locator("main.app-shell");
  await expect(shell).not.toHaveClass(/dark-mode/);

  await page.locator(".theme-dark-mode-toggle input").check();
  await expect(shell).toHaveClass(/dark-mode/);
  await expect(shell).toHaveClass(/theme-clear/);

  // Ett barns dashboard (space-temat) har ingen mörkt läge-växel alls —
  // ren barnvy, opåverkad av vuxnas mörka-läge-val.
  await page.getByRole("button", { name: "Medlemmar" }).click();
  await page.getByRole("button", { name: /Nova/ }).click();
  await expect(shell).toHaveClass(/theme-space/);
  await expect(shell).not.toHaveClass(/dark-mode/);
});

test("Mörkt läge: text/bakgrund-kontrast klarar WCAG AA (4.5:1) för alla sex vuxenteman", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto & familj" }).click();
  await page.getByRole("button", { name: "Utseende" }).click();

  for (const themeId of ["clear", "sunset", "turquoise", "lagoon", "orchid", "dusk"]) {
    await page.locator(`.theme-option.theme-${themeId}`).click();
    await page.locator(".theme-dark-mode-toggle input").check();

    const shell = page.locator("main.app-shell");
    const [bgVar, fgVar, cardVar, borderVar] = await shell.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [
        cs.getPropertyValue("--background"),
        cs.getPropertyValue("--foreground"),
        cs.getPropertyValue("--card"),
        cs.getPropertyValue("--border"),
      ];
    });

    const [bg, fg, card, border] = await Promise.all([bgVar, fgVar, cardVar, borderVar].map((v) => toPixel(page, v)));

    expect(contrast(fg, bg), `${themeId}: text/bakgrund`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg, card), `${themeId}: text/kort`).toBeGreaterThanOrEqual(4.5);
    // WCAG 1.4.11 (icke-text, gränser för UI-komponenter): >=3:1.
    expect(contrast(border, bg), `${themeId}: kant/bakgrund`).toBeGreaterThanOrEqual(3);
  }
});

test("Mörkt läge: rubriker utan egen color-regel (t.ex. Inställningar-h2) är läsbara, inte bara uttryckligen färgsatta ytor", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Konto & familj" }).click();
  await page.getByRole("button", { name: "Utseende" }).click();
  await page.locator(".theme-dark-mode-toggle input").check();

  const heading = page.locator("h2", { hasText: "Inställningar" });
  const [headingColor, bgVar] = await Promise.all([
    heading.evaluate((el) => getComputedStyle(el).color),
    page.locator("main.app-shell").evaluate((el) => getComputedStyle(el).getPropertyValue("--background")),
  ]);
  const [fgPixel, bgPixel] = await Promise.all([toPixel(page, headingColor), toPixel(page, bgVar)]);
  expect(contrast(fgPixel, bgPixel), "h2/bakgrund").toBeGreaterThanOrEqual(4.5);
});
