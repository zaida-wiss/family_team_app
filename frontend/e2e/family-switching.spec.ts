import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-07-31, Zaidas fynd: "nu kom jag in på min dotter Moas inställningar
// när jag loggade in på mitt konto. Så får det inte vara. Endast mina egna
// inställningar ska jag kunna nå, ingen annan skall heller kunna nå mina."
// — Hem-vyns tidigare, lättillgängliga "Familj"-dropdown (som BYTTE HELA
// INLOGGNINGSSESSIONEN till ett annat av dina egna konton, inklusive
// åtkomst till DESS Inställningar) togs bort helt. Att byta session till
// ett annat av dina egna konton kräver nu ett MEDVETET steg — headerns
// "Byt vy"-knapp (HeroBar.tsx, onSwitchAccount) som går till en egen
// kontoväljar-sida (AccountPicker.tsx), inte en casual dropdown mitt i
// Hem-vyn. Hem-vyns NYA "Visa familj"-filter (MemberOverview.tsx) är rent
// visningsmässigt — byter ALDRIG session/Inställningar, bara vad
// sammanfattningskorten visar.

const ROLE = {
  id: "role-1", name: "Förälder", isChildRole: false,
  permissions: {
    canManageMembers: true, canManageRoles: true, canSeeAllTodos: true, canSeeOwnTodos: true, canCreateTodos: true,
    canScheduleRecurringTodos: true, canCompleteAssignedTodos: true, canEditAnyTodos: true, canDeleteAnyTodos: true,
    canApproveTodos: true, canSeeAllCalendar: true, canSeeOwnCalendar: true, canCreateCalendar: true,
    canEditCalendar: true, canImportCalendar: true, canExportCalendar: true, canSeeShoppingLists: true,
    canCreateShoppingLists: true, canEditShoppingLists: true, canViewTrash: true, canRestoreFromTrash: true,
    canCreateChildAccounts: true, canManageChildTodos: true
  }
};

const ACCOUNT_A = { id: "acc-a", name: "Familjen A", type: "family", createdBy: "mem-a", deletedAt: null };
const ACCOUNT_B = { id: "acc-b", name: "Familjen B", type: "family", createdBy: "mem-b", deletedAt: null };
const MEMBER_A = {
  id: "mem-a", accountId: "acc-a", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null
};
const MEMBER_B = {
  id: "mem-b", accountId: "acc-b", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Förälder A", createdAt: "2024-01-01T00:00:00.000Z", lastActiveMemberId: "mem-a" };

test("Familj B syns inte längre som ett val i Hem-vyn — byte av session kräver 'Byt vy' i headern (kontoväljaren), inte en dropdown i Hem", async ({ page }) => {
  let currentUser = { ...USER };

  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: currentUser,
        memberships: [{ member: MEMBER_A, account: ACCOUNT_A }, { member: MEMBER_B, account: ACCOUNT_B }]
      }
    })
  );
  await page.route("**/api/auth/preferences", (route) => {
    const body = route.request().postDataJSON() as { lastActiveMemberId: string };
    currentUser = { ...currentUser, lastActiveMemberId: body.lastActiveMemberId };
    return route.fulfill({ json: { user: currentUser } });
  });
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    const accountMembers = memberId === "mem-b" ? [MEMBER_B] : [MEMBER_A];
    return route.fulfill({ json: accountMembers });
  });

  await page.goto("/");

  // Ingen mid-session-dropdown i Hem-vyn längre — den gamla, lättillgängliga
  // "Familj"-väljaren som direkt bytte session/Inställningar är borttagen.
  await expect(page.getByLabel("Familj", { exact: true })).toHaveCount(0);

  // "Byt vy" i headern → kontoväljaren, ett MEDVETET steg.
  await page.getByRole("button", { name: /Byt vy/ }).click();
  await expect(page.getByRole("heading", { name: "Välj konto" })).toBeVisible();

  await page.getByRole("button", { name: /Familjen B/ }).click();
  await expect(page.getByRole("button", { name: /Byt vy/ })).toBeVisible();

  // Tillbaka igen — kärnan i den ursprungliga buggen (2026-07-29) var att
  // Familjen A slutade gå att välja efter ett byte. Fortsatt sant här,
  // fast via kontoväljaren istället för en Hem-dropdown.
  await page.getByRole("button", { name: /Byt vy/ }).click();
  await expect(page.getByRole("button", { name: /Familjen A/ })).toBeVisible();
  await page.getByRole("button", { name: /Familjen A/ }).click();
  await expect(page.getByRole("button", { name: /Byt vy/ })).toBeVisible();
});

// 2026-07-30, Zaidas önskemål: "i hemmet skall du kunna växla mellan olika
// familjer och där skall gemensamma inköpslistor, todos, kalendrar,
// medlemmar visas" — Hem-panelen fick tre nya sammanfattningskort
// (Medlemmar/Uppgifter/Inköp) bredvid den redan befintliga kalendern. Testar
// samtidigt den relaterade cache-scopningsfixen (localCache.ts:s
// setCacheNamespace) — utan den skulle Familjen B:s Hem-vy kort visa
// Familjen A:s cachade uppgift/lista innan den färska hämtningen hann landa.
// Bytet sker nu via headerns "Byt vy" → kontoväljaren (se testet ovan för
// varför), inte längre via en dropdown i Hem.
const TODO_A = {
  id: "todo-a", accountId: "acc-a", title: "Handla mjölk", createdBy: "mem-a",
  assignedTo: "mem-a", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};
const TODO_B = { ...TODO_A, id: "todo-b", accountId: "acc-b", title: "Klippa gräset", createdBy: "mem-b", assignedTo: "mem-b" };

const LIST_A = {
  id: "shop-a", accountId: "acc-a", name: "Veckohandling A", ownerId: "mem-a", color: "#2f7d6d", icon: null,
  sharedWith: [], deletedAt: null, deletedBy: null,
  items: [{ id: "item-a", title: "Mjölk", createdBy: "mem-a", done: false, deletedAt: null, deletedBy: null }]
};
const LIST_B = {
  id: "shop-b", accountId: "acc-b", name: "Veckohandling B", ownerId: "mem-b", color: "#2f7d6d", icon: null,
  sharedWith: [], deletedAt: null, deletedBy: null,
  items: [{ id: "item-b", title: "Bröd", createdBy: "mem-b", done: false, deletedAt: null, deletedBy: null }]
};

test("Hem visar rätt familjs uppgifter/inköpslistor/medlemmar efter ett kontobyte, ingen kvarbliven cache från föregående familj", async ({ page }) => {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: USER,
        memberships: [{ member: MEMBER_A, account: ACCOUNT_A }, { member: MEMBER_B, account: ACCOUNT_B }]
      }
    })
  );
  await page.route("**/api/auth/preferences", (route) => route.fulfill({ json: { user: USER } }));
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    return route.fulfill({ json: memberId === "mem-b" ? [MEMBER_B] : [MEMBER_A] });
  });
  await page.route("**/api/todos", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    return route.fulfill({ json: memberId === "mem-b" ? [TODO_B] : [TODO_A] });
  });
  await page.route("**/api/shopping", (route) => {
    const memberId = route.request().headers()["x-member-id"];
    return route.fulfill({ json: memberId === "mem-b" ? [LIST_B] : [LIST_A] });
  });

  await page.goto("/");

  // Todos/Inköp ligger var sin flik (2026-07-31) — inte synliga samtidigt.
  await page.getByRole("button", { name: "Visa todos" }).click();
  await expect(page.getByText("Handla mjölk")).toBeVisible();
  await expect(page.getByText("Klippa gräset")).not.toBeVisible();

  await page.getByRole("button", { name: "Visa inköpslista" }).click();
  await expect(page.getByText("Veckohandling A")).toBeVisible();

  await page.getByRole("button", { name: /Byt vy/ }).click();
  await page.getByRole("button", { name: /Familjen B/ }).click();

  // Hela Shell remountas vid ett kontobyte (key={member.id}) — Hem-vyns
  // fliksval är lokal state och återgår till standard (kalender), måste
  // väljas igen.
  await page.getByRole("button", { name: "Visa inköpslista" }).click();

  // Ingen kvarbliven cache från Familjen A — den gamla listan ska inte
  // synas efter bytet, ens innan den färska hämtningen landar.
  await expect(page.getByText("Veckohandling B")).toBeVisible();
  await expect(page.getByText("Veckohandling A")).not.toBeVisible();

  await page.getByRole("button", { name: "Visa todos" }).click();
  await expect(page.getByText("Klippa gräset")).toBeVisible();
  await expect(page.getByText("Handla mjölk")).not.toBeVisible();
});
