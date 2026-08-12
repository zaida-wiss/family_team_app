import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-07-23): "Klickar vi på hemmet eller kalendern så ska det inte
// längre vara barnvyn" — reverserar 2026-07-21/22-beteendet som den här
// filen tidigare testade (att Kalender-panelen visade en vald familjemedlems
// kalender som förval). Med den nya designen (Shell.tsx:s PanelRouter,
// useAppState.ts:s setActivePanel) rensas ett medlemsval alltid när man
// navigerar till NÅGON av Hem/Kalender/Todos/Inköp — att välja någon i
// Medlemmar-panelen påverkar bara den panelen. Kalender-panelen visar därför
// alltid den INLOGGADE förälderns egen kalender, oavsett vem som senast
// valdes i medlemsväljaren.

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
  lastActivePanel: "home", lastSelectedDashboardMemberId: null,
};
const OTHER_ADULT = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};

// Dagens datum, inte ett hårdkodat datum (samma tidsberoende testfälla som
// redan dokumenterats flera gånger i CLAUDE.md) — kalendern visar som
// standard INNEVARANDE månad, ett hårdkodat datum slutar tomt så fort
// systemklockan passerat den månaden.
const today = new Date();
const eventDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;

function calendarEvent(overrides: Record<string, unknown>) {
  return {
    id: overrides.id, calendarId: overrides.calendarId, title: overrides.title,
    startsAt: `${eventDateStr}T09:00:00.000Z`, endsAt: `${eventDateStr}T10:00:00.000Z`,
    isAllDay: false, color: null, uid: null, subscriptionId: null,
    location: null, notes: null, recurrence: { type: "none" }, attendees: [],
    symbol: null, createdBy: "mem-1", deletedAt: null, deletedBy: null,
    ...overrides
  };
}

const PARENT_CALENDAR = {
  id: "cal-parent", name: "Testförälderns kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [calendarEvent({ id: "ev-parent", calendarId: "cal-parent", title: "Förälderns möte" })],
  importedSources: [], subscriptions: [],
};
const LARS_CALENDAR = {
  id: "cal-lars", name: "Lars kalender", ownerId: "mem-2", color: "#a855f7",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [calendarEvent({ id: "ev-lars", calendarId: "cal-lars", title: "Lars tandläkarbesök" })],
  importedSources: [], subscriptions: [],
};

// 2026-08-10: mockDataAPIs() (helpers.ts) registreras FÖRST — ersätter den
// tidigare manuella, ofullständiga listan av "nyare endpoints" nedan (se
// git-historiken) med den delade, kontinuerligt uppdaterade hjälparen. Se
// todo-timer.spec.ts:s identiska kommentar för bugklassen.
async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER_ADULT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
}

test("Klickar igenom Hem → Medlemmar → välj en vuxen → Kalender: visar min VANLIGA kalendervy, inte filtrerad till den valda personen", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [PARENT_CALENDAR, LARS_CALENDAR] }));
  // Registrerad EFTER den breda mocken ovan (Playwright: senast registrerad
  // matchning vinner) — annars skulle /cross-account och /connections
  // (2026-07-30, sammanslagna kalendrar) av misstag också få samma lista,
  // vilket dubblerar varje händelse i kalendervyn.
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");

  // Hem → "Visa medlemmar" (andra navbaren, ersätter sedan 2026-08-09 den
  // borttagna Medlemmar-ikonen på första navbaren) → klicka på Lars — visas
  // nu i Medlemmar-panelen själv, navigerar inte längre bort.
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Lars" }).click();

  // Klicket på Kalender-ikonen rensar valet (useAppState.ts:s setActivePanel)
  // — visar min vanliga, ofiltrerade kalendervy igen. Rollen har
  // canSeeAllCalendar, så BÅDA kalendrarna syns (ingen filtrering på en
  // specifik person längre) — det är just avsaknaden av en Lars-ENDAST-
  // filtrering som visar att bugfixen fungerar, inte att Lars kalender
  // försvinner helt.
  await page.getByRole("button", { name: "Kalender", exact: true }).click();

  // .first() — månadsvyn visar varje händelse BÅDE som en pill i minirutnätet
  // och som en rad i den bredvidliggande agenda-listan (CalendarMonthLayout),
  // en legitim dubbelrendering, inte ett fel — testet bryr sig bara om att
  // händelsen syns NÅGONSTANS.
  await expect(page.getByText("Förälderns möte").first()).toBeVisible();
  await expect(page.getByText("Lars tandläkarbesök").first()).toBeVisible();
});
