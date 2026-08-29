import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-07-23): "När vi är på denna [barnvyn/medlemsvyn] så är det
// endast medlemmar symbolen som skall vara markerad. Klickar vi på hemmet
// eller kalendern så ska det inte längre vara barnvyn." — reverserar
// 2026-07-22-beslutet (som testades av just den här filen tidigare): att
// välja ett barn i Medlemmar-panelen lät tidigare Kalender/Todos/Inköp/Hem
// FORTSÄTTA visa barnets dashboard, med FEL nav-ikon markerad som aktiv.
// Nu: ett val av en medlem (ursprungligen MembersView.tsx:s kort) visas bara
// HÄR, i Medlemmar-panelen (activePanel förblir "members", se Shell.tsx:s
// PanelRouter) — varje annat nav-klick rensar valet (useAppState.ts:s
// setActivePanel), vilket fungerar som en implicit "tillbaka till min egen
// vy"-väg.
//
// 2026-08-09 (Zaidas beslut: "ta bort members från första navbaren och
// använd member på andra navbaren istället"): HeroBar.tsx:s egen
// Medlemmar-nav-ikon togs bort helt — Hem-vyns "Visa medlemmar"-popup
// (MemberOverview.tsx) är nu enda vägen till en medlems dashboard, och
// väljer man en medlem sätts activePanel till "members" i SAMMA klick
// (MemberShellContent.tsx:s handleSelectMemberFromHome). Ingen av
// HeroBar.tsx:s kvarvarande sex nav-ikoner (Hem/Kalender/Inköp/Todos/
// Recept/Inställningar) motsvarar längre "members"-panelen, så INGEN av
// dem visas som aktiv medan man tittar på en vald medlems dashboard — de
// två sista testen nedan omskrivna för detta.
//
// 2026-08-29 (Zaidas beslut, mockup-bild): "Visa medlemmar"-fliken/-popupen
// togs i sin tur bort och ersattes av en riktig dashboard-standardvy på
// Hem ("overview", MemberOverview.tsx) — medlemslistan visas nu direkt när
// man landar på Hem, inget mellanklick krävs. selectChild() nedan behöver
// därför inte längre klicka en flik innan medlemslistan syns.

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
const ROLE = {
  id: "role-1", name: "Förälder", isChildRole: false,
  permissions: {
    canManageMembers: true, canManageRoles: true,
    canSeeAllTodos: true, canSeeOwnTodos: true, canCreateTodos: true,
    canScheduleRecurringTodos: true, canCompleteAssignedTodos: true,
    canEditAnyTodos: true, canDeleteAnyTodos: true, canApproveTodos: true,
    canSeeAllCalendar: true, canSeeOwnCalendar: true, canCreateCalendar: true,
    canEditCalendar: true, canImportCalendar: true, canExportCalendar: true,
    canSeeShoppingLists: true, canCreateShoppingLists: true, canEditShoppingLists: true,
    canViewTrash: true, canRestoreFromTrash: true,
    canCreateChildAccounts: true, canManageChildTodos: true,
  },
};
const CHILD_ROLE = { ...ROLE, id: "role-child", name: "Barn", isChildRole: true };

const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};

// 2026-08-10: mockDataAPIs() (helpers.ts) registreras FÖRST — se
// todo-timer.spec.ts:s identiska kommentar (samma bugklass: en lokal, stale
// mock saknar nyare endpoints, faller igenom till nätverket, äkta 401 →
// utloggning mitt i testet).
async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
}

async function selectChild(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();
}

for (const [panelLabel] of [["Hem"], ["Kalender"], ["Todos"], ["Inköp"]] as const) {
  test(`Vuxen som valt ett barn och klickar ${panelLabel} ser sin EGEN vy, inte barnets dashboard`, async ({ page }) => {
    await mockCommon(page);
    await selectChild(page);

    await page.getByRole("button", { name: panelLabel }).click();

    await expect(page.getByText("Hej Nova!")).toHaveCount(0);
  });
}

test("Ingen nav-ikon i första navbaren är markerad så länge man tittar på en vald medlems vy", async ({ page }) => {
  await mockCommon(page);
  await selectChild(page);

  // Ingen av de sex kvarvarande nav-ikonerna motsvarar "members"-panelen
  // (den nås numera bara via Hem-vyns "Visa medlemmar"-popup) — ett
  // regressionsskydd mot att någon av dem av misstag skulle visas som
  // aktiv medan activePanel egentligen är "members".
  for (const label of ["Hem", "Kalender", "Inköp", "Todos", "Recept", "Inställningar"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).not.toHaveClass(/active/);
  }
});

test("Ett klick på Hem tar tillbaka till den egna hemvyn (avväljer) och medlemslistan visas igen", async ({ page }) => {
  await mockCommon(page);
  await selectChild(page);

  await page.getByRole("button", { name: "Hem", exact: true }).click();

  await expect(page.getByText("Hej Nova!")).toHaveCount(0);
  // Samma re-klick-på-redan-aktiv-panel-mekanism som Inställningar redan
  // använder (panelNavResetKey, useAppState.ts) remountar Hem-panelen och
  // nollställer den till sin standardvy — "overview" (medlemslistan m.m.).
  await expect(page.getByRole("group", { name: "Medlemslista" })).toBeVisible();
});

// 2026-08-10, Zaidas fynd: "jag tappar navbarerna och blir fast på
// childrensview" vid ≥1024px bred skärm — .app-shell-full (layout.css)
// döljer sidonaven avsiktligt för currentMember.isChild, men fick tidigare
// EXAKT samma behandling för isViewingMemberDashboard (en VUXEN som tittar
// på en vald medlems dashboard) trots att varken ChildDashboard.tsx eller
// PersonalDashboard.tsx har någon egen tillbaka-knapp — och en grid-
// placeringsbugg (se layout.css/HeroBar.module.css) puttade dessutom
// sidonaven ner en hel skärmhöjd, osynlig utan manuell scroll. Playwrights
// vanliga .click() maskerade båda buggarna (auto-scrollar in elementet
// innan klick, precis som testet ovan visar) — bara en explicit position-
// koll (utan att klicka) avslöjar det en riktig användare faktiskt ser.
test("Sidonaven förblir synlig UTAN scroll (inget klick, bara position) på desktopbredd medan man tittar på en vald medlems dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockCommon(page);
  await selectChild(page);

  const homeButton = page.getByRole("button", { name: "Hem", exact: true });
  await expect(homeButton).toBeVisible();
  const box = await homeButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(900);

  const appShellHeight = await page.locator(".app-shell").evaluate((el) => el.getBoundingClientRect().height);
  expect(appShellHeight).toBeLessThanOrEqual(900);
});
