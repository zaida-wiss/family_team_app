import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-01, Zaidas önskemål: "I todo på familjevyn skall jag precis som i
// min egen todo-vy kunna lägga till nya todos som är förinställda på den
// aktuella familjen. Samma gäller inköpslistan" — och senare: "det skall
// vara bollar i familjevyns todo, precis som i min egen, men andra färger i
// temat". Rättad samma dag: skapande (todos+inköpslistor) fungerar bara för
// familjer jag är en RIKTIG medlem av (mitt eget konto eller Mina
// familjekonton) — ALDRIG en Familjeanslutning.
//
// Vidare rättelse samma dag: "hemvyn skall vara återanvändbara moduler med
// samma logik som i navbarens vyer... man skall signa upp sig på en
// uppgift på samma sätt som i todovyn med bollar i trådar" — "Ta uppgiften"/
// "Släpp"-knapparna ersatta av samma dubbeltryck-"vem håller på med den
// här"-gest som Todos-panelen redan har (se FamilyTodoThreads.tsx), och
// "Lägg till uppgift" flyttad in i trådens egen kategorimeny (klick på
// trådens rubrik) istället för ett alltid synligt formulär.

const ACCOUNT = { id: "acc-a", name: "Familjen A", type: "family", createdBy: "mem-a", deletedAt: null };
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
const MEMBER_A = {
  id: "mem-a", accountId: "acc-a", userId: "user-1", name: "Förälder A", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: "clear", spentStars: 0, deletedAt: null, deletedBy: null
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Förälder A", createdAt: "2024-01-01T00:00:00.000Z" };

test("Hem-vyns Todos-flik: bollar + Lägg till uppgift via kategorimenyn (egen familj och Mina familjekonton), signa upp sig via dubbeltryck", async ({ page }) => {
  let lastOwnTodoPost: Record<string, unknown> | null = null;
  let lastInProgressPatch: Record<string, unknown> | null = null;
  // Statefull mock — skapande/in-progress måste synas i NÄSTA GET (hooken
  // refreshar sig själv efter varje mutation), annars renderas aldrig
  // bollen/signup-väljaren.
  const crossAccountTodos: Record<string, unknown>[] = [];

  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "POST") {
      lastOwnTodoPost = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: "todo-new-own" } });
    }
    return route.fulfill({ json: [] });
  });

  await page.route("**/api/todos/family-across-accounts/acc-b/*/in-progress", (route) => {
    lastInProgressPatch = route.request().postDataJSON() as Record<string, unknown>;
    const todo = crossAccountTodos.find((t) => route.request().url().includes(t.id as string));
    if (todo) todo.inProgressBy = [lastInProgressPatch.targetMemberId];
    return route.fulfill({ json: { inProgressBy: [lastInProgressPatch.targetMemberId], inProgressSince: new Date().toISOString() } });
  });
  await page.route("**/api/todos/family-across-accounts/acc-b", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    crossAccountTodos.push({
      id: "todo-new-b", accountId: "acc-b", title: body.title, assignedTo: null, inProgressBy: [],
      visual: { type: "lucide-icon", value: body.visual ?? "⭐" }, status: "pending",
      deletedAt: null, recurrence: { type: "none" }, recurringSourceId: null
    });
    return route.fulfill({ status: 201, json: { id: "todo-new-b" } });
  });
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", myMemberId: "mem-b-a", todos: crossAccountTodos }] })
  );
  await page.route("**/api/members/cross-account", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", members: [{ id: "mem-b-a", name: "Förälder A", avatarUrl: null, color: null, isChild: false }] }] })
  );

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  const familyFilter = page.locator("#home-family-select");
  await expect(familyFilter).toBeVisible();

  // Min egen familj vald (default) — Lägg till uppgift via trådens
  // kategorimeny (klick på "Familjen"-rubriken öppnar menyn efter en kort
  // fördröjning, samma tre-tryck-disambiguering som Todos-panelens trådar).
  await familyFilter.selectOption({ label: "Familjen A" });
  const familyThreadHeader = page.getByRole("button", { name: /^Familjen\./ });
  await familyThreadHeader.click();
  await page.getByRole("button", { name: "Lägg till uppgift" }).click();
  await page.getByLabel("Lägg till en uppgift").fill("Handla mjölk");
  await page.getByRole("button", { name: "Lägg till", exact: true }).click();
  await expect.poll(() => lastOwnTodoPost?.title).toBe("Handla mjölk");
  expect(lastOwnTodoPost?.assignedTo).toBeNull();

  // Familjen B (Mina familjekonton) — Lägg till en uppgift DÄR istället.
  await familyFilter.selectOption({ label: "Familjen B" });
  const familyBThreadHeader = page.getByRole("button", { name: /^Familjen B\./ });
  await familyBThreadHeader.click();
  await page.getByRole("button", { name: "Lägg till uppgift" }).click();
  await page.getByLabel("Lägg till en uppgift").fill("Handla mjölk i B");
  await page.getByRole("button", { name: "Lägg till", exact: true }).click();

  // Bollen syns i familjevyn (samma stil som Todos-panelen, se
  // .todo-thread__ball--home). Dubbeltryck öppnar "vem håller på med den
  // här"-väljaren (samma gest som lokalt) — klick på sig själv signar upp.
  const todosCard = page.locator("article.dashboard").filter({ has: page.locator(".todo-thread-view") });
  const bubble = todosCard.locator(".todo-thread__ball--home");
  await expect(bubble).toBeVisible();
  await bubble.dblclick();
  // Väljaren portaleras till document.body med role="menu" (samma mönster
  // som ParentTodoThreadView.tsx) — skopad hit eftersom Hem-vyns egen
  // Medlemmar-kort också har en knapp med samma namn (mitt eget konto).
  await page.getByRole("menu").getByRole("button", { name: "Förälder A" }).click();
  await expect.poll(() => lastInProgressPatch?.targetMemberId).toBe("mem-b-a");
});

test("Hem-vyns Inköp-flik: ny lista, förinställd på vald familj — bara egen familj eller Mina familjekonton, aldrig en Familjeanslutning", async ({ page }) => {
  let lastOwnListPost: Record<string, unknown> | null = null;
  let crossAccountListPosted = false;

  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: { accessToken: "fake-access-token", user: USER, memberships: [{ member: MEMBER_A, account: ACCOUNT }] } })
  );
  await mockDataAPIs(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER_A] }));
  await page.route("**/api/shopping", (route) => {
    if (route.request().method() === "POST") {
      lastOwnListPost = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { id: "shopping-new-own" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/shopping/cross-account/acc-b", (route) => {
    crossAccountListPosted = true;
    return route.fulfill({ status: 201, json: { id: "shopping-new-b" } });
  });
  await page.route("**/api/shopping/cross-account", (route) =>
    route.fulfill({ json: [{ accountId: "acc-b", accountName: "Familjen B", lists: [] }] })
  );
  // Familjen C nås bara via en Familjeanslutning (ingen genuin identitet) —
  // syns i familjefiltret men ska INTE erbjuda "ny lista".
  await page.route("**/api/todos/connections", (route) =>
    route.fulfill({ json: [{ accountId: "acc-c", accountName: "Familjen C", access: "edit", todos: [] }] })
  );

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa inköpslista" }).click();

  const familyFilter = page.locator("#home-family-select");
  await familyFilter.selectOption({ label: "Familjen A" });
  await page.getByLabel("Lägg till en inköpslista").fill("Veckohandling");
  await page.getByLabel("Lägg till inköpslista").click();
  await expect.poll(() => lastOwnListPost?.name).toBe("Veckohandling");

  await familyFilter.selectOption({ label: "Familjen B" });
  await expect(page.getByLabel("Lägg till en inköpslista")).toBeVisible();
  await page.getByLabel("Lägg till en inköpslista").fill("Handling i B");
  await page.getByLabel("Lägg till inköpslista").click();
  await expect.poll(() => crossAccountListPosted).toBe(true);

  // Familjen C (bara en Familjeanslutning) — ingen "lägg till lista"-form alls.
  await familyFilter.selectOption({ label: "Familjen C" });
  await expect(page.getByLabel("Lägg till en inköpslista")).toHaveCount(0);
});
