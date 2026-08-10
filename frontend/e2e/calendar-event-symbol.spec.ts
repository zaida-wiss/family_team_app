import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-07-27, Zaidas fynd: "om jag uppdaterar en importerad kalenderhändelse
// med emoji så vill jag att den emojin skall synas i barnens vy om jag delar
// den med dom. I nuläget när jag försökte göra detta så blir det bara text."
//
// Grundorsak (tre ställen, alla fixade): useCalendarView.ts (vuxenvyns
// månad/vecka/lista), CalendarTimelineView.tsx och ChildTimeline.tsx räknade
// alla ut vilken symbol en händelse ska visas med, men lät en prenumererad
// händelses (subscriptionId satt) EGEN, manuellt satta symbol (event.symbol)
// bli helt överkörd av prenumerationens gemensamma standardsymbol (eller
// null om ingen standard fanns) — en användare som redigerade EN specifik
// importerad händelse och gav den en egen emoji såg aldrig effekten, i
// ingen vy. Delad resolveDisplaySymbol() i calendarHelpers.ts löser det
// konsekvent på alla tre ställen: händelsens EGEN symbol vinner alltid.

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
const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: PARENT, account: ACCOUNT }],
};

// Ingen Math.min(..., 27)-cap — samma tidsberoende testfälla som
// dokumenterats flera gånger tidigare denna session (t.ex. 2026-07-08):
// en cap under 31 bryter exakt de dagar i månaden som ligger över capen
// (28:e-31:a), eftersom now.getDate() alltid redan är giltig för
// now.getFullYear()/now.getMonth().
const now = new Date();
const eventStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0).toISOString();
const eventEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).toISOString();

// Importerad händelse (subscriptionId satt) med en EGEN, manuellt satt
// symbol — prenumerationens EGEN standardsymbol (🎌) skiljer sig medvetet
// från händelsens (🦷) för att bevisa att rätt (den senare) vinner.
const IMPORTED_EVENT = {
  id: "ev-imported", calendarId: "cal-1", title: "Tandläkarbesök (importerad)",
  startsAt: eventStart, endsAt: eventEnd, isAllDay: false, color: null, uid: "uid-1",
  subscriptionId: "sub-1", location: null, notes: null, recurrence: { type: "none" },
  attendees: [], symbol: "🦷", createdBy: "mem-1", deletedAt: null, deletedBy: null,
};

const CALENDAR = {
  id: "cal-1", name: "Testförälderns kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  events: [IMPORTED_EVENT],
  importedSources: [],
  subscriptions: [
    { id: "sub-1", calendarId: "cal-1", url: "https://example.com/cal.ics", includeWords: [], excludeWords: [], dateFrom: null, dateTo: null, lastSyncedAt: null, displaySymbol: "🎌", syncIntervalMinutes: 60 }
  ],
};

// 2026-08-10: mockDataAPIs() (helpers.ts) registreras FÖRST — se
// todo-timer.spec.ts:s identiska kommentar (samma bugklass).
async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
}

test("Kalender-panelen (månadsvy): en importerad händelses egen symbol visas, inte prenumerationens standard", async ({ page }) => {
  await mockCommon(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [CALENDAR] }));
  // Registrerad EFTER den breda mocken ovan (Playwright: senast registrerad
  // matchning vinner) — annars skulle /cross-account och /connections
  // (2026-07-30, sammanslagna kalendrar) av misstag också få [CALENDAR],
  // vilket dubblerar varje händelse i kalendervyn.
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();

  const pill = page.locator(".cal-event-pill[title='Tandläkarbesök (importerad)']");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("🦷");
  await expect(pill).not.toContainText("🎌");
});

test("Barnets tidslinje: samma importerade händelses egen symbol visas när barnet delats in på kalendern", async ({ page }) => {
  const CHILD_ROLE = {
    id: "role-child", name: "Barn", isChildRole: true,
    permissions: {
      canManageMembers: false, canManageRoles: false,
      canSeeAllTodos: false, canSeeOwnTodos: true, canCreateTodos: false,
      canScheduleRecurringTodos: false, canCompleteAssignedTodos: true,
      canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: false,
      canSeeAllCalendar: false, canSeeOwnCalendar: true, canCreateCalendar: false,
      canEditCalendar: false, canImportCalendar: false, canExportCalendar: false,
      canSeeShoppingLists: false, canCreateShoppingLists: false, canEditShoppingLists: false,
      canViewTrash: false, canRestoreFromTrash: false,
      canCreateChildAccounts: false, canManageChildTodos: false,
    },
  };
  const CHILD = {
    id: "mem-child", accountId: "acc-1", userId: null,
    name: "Nova", roleId: "role-child", isChild: true,
    avatarUrl: null, color: null, dashboardTheme: null,
    approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
  };
  const CHILD_USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };
  const CHILD_LOGIN_RESPONSE = {
    accessToken: "fake-access-token", user: CHILD_USER, memberships: [{ member: CHILD, account: ACCOUNT }],
  };
  // Kalendern delad med barnet (view räcker för att synas i tidslinjen).
  const SHARED_CALENDAR = { ...CALENDAR, sharedWith: [{ memberId: CHILD.id, access: "view" }] };

  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: CHILD_LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [SHARED_CALENDAR] }));
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));

  await page.goto("/");

  const symbolEl = page.locator(".child-tl-event-symbol", { hasText: "🦷" });
  await expect(symbolEl).toBeVisible();
  await expect(page.locator(".child-tl-event-symbol", { hasText: "🎌" })).toHaveCount(0);
});
