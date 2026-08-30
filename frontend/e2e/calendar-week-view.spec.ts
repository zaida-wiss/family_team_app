import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-30, Zaidas önskemål: "dagens datum först och en vecka framåt" —
// uppföljt av "endast i familjens dashboard alltså" + "kalendrarna i övrigt
// skall vara oförändrade". Bara Hem-vyns dashboard-inbäddade kalender
// (MemberOverview.tsx:s "Visa kalender"-flik, CalendarView.tsx:s
// displayOnly=true) fick rullande vecka (weekStart = dagens datum, inte
// måndag-ankrad) — den fristående Kalender-panelen (HeroBar → Kalender,
// CalendarPage.tsx, displayOnly=false) är MEDVETET oförändrad, se
// useCalendarView.ts:s rollingWeek-parameter. Två test: ett som bevisar den
// nya rullande veckan i Hem-vyn, ett som bevisar att den fristående panelen
// fortfarande är måndag-ankrad (regressionsskydd mot att av misstag ändra
// båda).

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
const CALENDAR = {
  id: "cal-own", name: "Min kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  importedSources: [], subscriptions: [], events: []
};

const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function fmtShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
}
// Samma algoritm som useCalendarView.ts:s getWeekMonday — måndagen i
// veckan som innehåller `d`.
function mondayOf(d: Date): Date {
  const dow = (d.getDay() + 6) % 7;
  return addDays(d, -dow);
}

async function setup(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [CALENDAR] }));
}

test("Hem-vyns Kalender-flik: dagens datum är alltid första kolumnen i veckovyn, en vecka framåt", async ({ page }) => {
  await setup(page);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await page.goto("/");
  // Hem-vyns familjenavbar → "Visa kalender"-fliken (MemberOverview.tsx),
  // inte HeroBars fristående "Kalender"-knapp.
  await page.getByRole("tab", { name: "Visa kalender" }).click();
  await expect(page.getByText("Familjens kalender")).toBeVisible();
  await page.getByRole("button", { name: "Veckovy" }).click();

  const dayColumns = page.locator(".cal-week-col");
  await expect(dayColumns.first()).toHaveClass(/cal-week-col--today/);
  await expect(dayColumns).toHaveCount(7);

  const weekEnd = addDays(today, 6);
  await expect(page.locator(".cal-week-title")).toContainText(`${fmtShort(today)} – ${fmtShort(weekEnd)}`);

  // "Nästa vecka" flyttar hela 7-dagarsfönstret framåt (inte till nästa
  // kalendervecka) — ingen kolumn är "idag" längre.
  await page.getByRole("button", { name: "Nästa vecka" }).click();
  const nextStart = addDays(today, 7);
  const nextEnd = addDays(today, 13);
  await expect(page.locator(".cal-week-title")).toContainText(`${fmtShort(nextStart)} – ${fmtShort(nextEnd)}`);
  await expect(page.locator(".cal-week-col--today")).toHaveCount(0);

  await page.getByRole("button", { name: "Föregående vecka" }).click();
  await expect(dayColumns.first()).toHaveClass(/cal-week-col--today/);
});

test("Fristående Kalender-panelen (HeroBar): veckovyn är fortfarande måndag-ankrad, oförändrad", async ({ page }) => {
  await setup(page);

  const monday = mondayOf(new Date());
  const sunday = addDays(monday, 6);

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await page.getByRole("button", { name: "Veckovy" }).click();

  // Veckan börjar på MÅNDAG (kan vara vilken kolumn "idag" råkar landa i,
  // inte nödvändigtvis den första) — datumintervallet i huvudet bevisar det.
  await expect(page.locator(".cal-week-title")).toContainText(`${fmtShort(monday)} – ${fmtShort(sunday)}`);
  await expect(page.locator(".cal-week-col")).toHaveCount(7);
});
