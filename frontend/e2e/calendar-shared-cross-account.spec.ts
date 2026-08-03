import { test, expect } from "@playwright/test";

// 2026-07-30, Zaidas uppföljning: "kalender man valt att dela med
// respektive familj skall komma upp i familjens tillgängliga kalendrar" —
// en kalender delad via "Mina familjekonton" (shareAcrossMyAccounts) eller
// en Familjeanslutning ska visas som en RIKTIG, filtrerbar kalender i den
// vanliga Kalender-panelen (månadsvyn), inte bara i en separat
// sammanfattningslista i Inställningar.

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
const PARENT = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "fake-access-token", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

const PARENT_CALENDAR = {
  id: "cal-parent", name: "Min kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [], importedSources: [], subscriptions: [], calDavConnections: [],
};

const todayIso = new Date().toISOString();
const inOneHourIso = new Date(Date.now() + 3_600_000).toISOString();

// Formen backend nu returnerar (calendarsService.ts:s toReadOnlyCalendar) —
// en RIKTIG Calendar, namnet suffigerat med källfamiljen, readOnly:true.
const SHARED_CALENDAR = {
  id: "cal-shared-from-b", accountId: "acc-2", name: "Moa jobb (Familj B)", color: "#a855f7",
  ownerId: "", sharedWith: [], deletedAt: null, deletedBy: null,
  importedSources: [], subscriptions: [], calDavConnections: [], readOnly: true,
  events: [{
    id: "ev-shared", calendarId: "cal-shared-from-b", title: "Kundmöte",
    startsAt: todayIso, endsAt: inOneHourIso, isAllDay: false, color: null, uid: null,
    subscriptionId: null, location: null, notes: null,
    recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null,
    createdBy: "mem-other", deletedAt: null, deletedBy: null,
  }],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reward-shop**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/recipes/**", (route) => route.fulfill({ json: [] }));
}

test("en kalender delad via Mina familjekonton visas i den riktiga Kalender-panelen, inte redigerbar", async ({ page }) => {
  await mockCommon(page);
  // Endast /cross-account (Mina familjekonton) har en delad kalender här —
  // /connections (Familjeanslutningar) är medvetet tom, för att isolera
  // vilken av de två källorna som testas.
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR] }));
  // Registrerade EFTER den breda mocken ovan (Playwright: senast
  // registrerad matchning vinner) — annars skulle den breda mocken
  // felaktigt svara på /cross-account och /connections också.
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [SHARED_CALENDAR] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();

  // Den delade kalenderns händelse syns i den vanliga Kalender-panelen —
  // både som en pill i månadsrutnätet och i dagens händelselista under.
  const eventPill = page.locator(".cal-event-pill", { hasText: "Kundmöte" });
  await expect(eventPill).toBeVisible();
  await expect(page.getByText("Kundmöte")).toHaveCount(2);

  // Namnet är suffigerat med källfamiljen — syns i kalenderväljar-/filter-UI:t.
  await expect(page.getByText("Moa jobb (Familj B)")).toBeVisible();

  // Klick på händelsen (i listraden under rutnätet, inte pillen — som kan
  // överlappas av dagens cell) visar detaljvyn UTAN någon redigera-knapp
  // (readOnly).
  await page.locator(".cal-event-row-title", { hasText: "Kundmöte" }).click();
  await expect(page.getByRole("button", { name: "Redigera" })).toHaveCount(0);
});

test("samma delade kalender syns INTE i Inställningar → Kalendrars hanteringslista (bara i den riktiga Kalender-panelen)", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR] }));
  // Registrerade EFTER den breda mocken ovan (Playwright: senast
  // registrerad matchning vinner) — annars skulle den breda mocken
  // felaktigt svara på /cross-account och /connections också.
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [SHARED_CALENDAR] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.locator(".settings-category-grid").getByRole("button", { name: "Kalender" }).click();

  // Kalenderväljaren i Settings (CalendarManagementCard) ska bara lista
  // kalendrar jag faktiskt kan hantera — inte den delade, readOnly-kalendern.
  const managementSelector = page.locator("select").filter({ hasText: "Min kalender" });
  await expect(managementSelector).toBeVisible();
  await expect(page.getByRole("option", { name: "Moa jobb (Familj B)" })).toHaveCount(0);
});
