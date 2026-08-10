import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-08-11): "Även om jag tillåter mina familjemedlemmar att se
// utvalda kalendrar jag godkänt, så är det i familjens kalender de skall
// visas. Inte i dashboarden." — en kalender delad till barnet via
// Kalenderåtkomst (sharedWith) gjorde tidigare att den automatiskt syntes på
// barnets EGEN dashboard-vy (ChildTimeline.tsx), eftersom båda vyerna
// använde samma canViewResource-koll. Nu är de två oberoende: sharedWith
// styr bara familjekalendern, ett nytt dashboardVisibleTo-fält (satt via en
// egen kryssruta under Medlemmar → Kalenderåtkomst → Dashboard) styr
// dashboarden. Barnets EGNA kalendrar visas alltid på dess egen dashboard,
// oavsett dashboardVisibleTo.

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
// canSeeAllCalendar: false — annars kringgås hela dashboardVisibleTo-kollen
// (ChildTimeline.tsx:s första gren). canSeeOwnCalendar: true krävs för att
// nå den nya filtreringsgrenen alls.
const CHILD_ROLE = {
  ...ROLE, id: "role-child", name: "Barn", isChildRole: true,
  permissions: { ...ROLE.permissions, canSeeAllCalendar: false, canSeeOwnCalendar: true },
};

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

// ChildTimeline visar bara VALD dag, som defaultar till DAGENS datum (inte
// någon godtycklig dag i månaden, till skillnad från den vanliga
// månadsvyns Kalender-panel) — händelserna måste alltså vara satta till
// idag för att synas utan att först navigera dag för dag i UI:t.
const today = new Date();
const eventDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

function allDayEvent(overrides: Record<string, unknown>) {
  return {
    id: overrides.id, calendarId: overrides.calendarId, title: overrides.title,
    startsAt: `${eventDateStr}T00:00:00.000Z`, endsAt: `${eventDateStr}T23:59:59.000Z`,
    isAllDay: true, color: null, uid: null, subscriptionId: null,
    location: null, notes: null, recurrence: { type: "none" }, attendees: [],
    symbol: null, createdBy: "mem-1", deletedAt: null, deletedBy: null,
    ...overrides
  };
}

// Delad till familjekalendern (sharedWith), men INTE till dashboarden —
// ska synas i Kalender-fliken, inte på Novas dashboard.
const SHARED_ONLY_CALENDAR = {
  id: "cal-shared", name: "Förälderns kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [{ memberId: "mem-child", access: "view" }], dashboardVisibleTo: [],
  deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [allDayEvent({ id: "ev-shared", calendarId: "cal-shared", title: "Delad familjehändelse" })],
  importedSources: [], subscriptions: [],
};
// Explicit ikryssad för dashboarden, men INTE delad till familjekalendern —
// ska synas på Novas dashboard trots att sharedWith är tom (bevisar att
// inställningarna är oberoende av varandra).
const DASHBOARD_ONLY_CALENDAR = {
  id: "cal-dashboard", name: "Dashboard-kalender", ownerId: "mem-1", color: "#a855f7",
  sharedWith: [], dashboardVisibleTo: ["mem-child"],
  deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [allDayEvent({ id: "ev-dashboard", calendarId: "cal-dashboard", title: "Dashboard-godkänd händelse" })],
  importedSources: [], subscriptions: [],
};
// Novas EGEN kalender — ska alltid synas på hennes dashboard.
const OWN_CALENDAR = {
  id: "cal-own", name: "Novas kalender", ownerId: "mem-child", color: "#e07a5f",
  sharedWith: [], dashboardVisibleTo: [],
  deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [allDayEvent({ id: "ev-own", calendarId: "cal-own", title: "Novas egen händelse" })],
  importedSources: [], subscriptions: [],
};

async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) =>
    route.fulfill({ json: [SHARED_ONLY_CALENDAR, DASHBOARD_ONLY_CALENDAR, OWN_CALENDAR] })
  );
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
}

test("Novas dashboard visar egna + dashboard-godkända kalendrar, men INTE en kalender som bara är delad till familjekalendern", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();

  await expect(page.getByText("Novas egen händelse")).toBeVisible();
  await expect(page.getByText("Dashboard-godkänd händelse")).toBeVisible();
  await expect(page.getByText("Delad familjehändelse")).toHaveCount(0);
});
