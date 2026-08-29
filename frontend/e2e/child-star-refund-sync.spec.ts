import { test, expect, type Page } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-29, Zaida: "barnen måste uppdatera sidan för att se att man skickat
// pengar tillbaka när man tagit bort deras köp" — en förälder som tar bort
// (ångrar) ett köp i Inställningar återbetalar stjärnorna server-side
// (deletePurchasedReward, rewardShopService.ts) och skickar redan en
// members-changed-SSE-händelse (broadcastMembersChanged), som redan triggade
// en omhämtning av members-listan i realtid (useMembersState.ts, sedan
// 2026-07-17) — men ChildDashboard.tsx:s EGEN localSpentStars-state (som
// availableStars/plånboken faktiskt räknas mot) initierades bara EN gång vid
// mount och synkades aldrig om mot det uppdaterade child.spentStars, så
// barnets redan öppna dashboard fortsatte visa det gamla (för låga) saldot
// tills sidan laddades om. Fixat med en useEffect som synkar localSpentStars
// varje gång child.spentStars faktiskt ändras.

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-parent", deletedAt: null };

const CHILD_ROLE = {
  id: "role-child",
  name: "Barn",
  isChildRole: true,
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

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

function childMember(spentStars: number) {
  return {
    id: "mem-child", accountId: "acc-1", userId: null,
    name: "Nova", roleId: "role-child", isChild: true,
    avatarUrl: null, color: null, dashboardTheme: null,
    approvedStars: 20, spentStars, deletedAt: null, deletedBy: null,
  };
}

async function mockChildSession(page: Page, initialSpentStars: number) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({
      json: {
        accessToken: "fake-access-token",
        user: USER,
        memberships: [{ member: childMember(initialSpentStars), account: ACCOUNT }],
      },
    })
  );
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
}

test("Ett barns tillgängliga stjärnor/plånbok uppdateras direkt när en förälder återbetalar ett köp, utan sidomladdning", async ({ page }) => {
  // Barnet har redan spenderat 15 av 20 stjärnor (5 tillgängliga) när dashboarden öppnas.
  await mockChildSession(page, 15);

  // GET /api/members hämtas om av useMembersState.ts:s SSE-prenumeration —
  // första anropet ger det gamla (ej återbetalade) saldot, andra (efter att
  // föräldern tagit bort köpet på en annan enhet) ger det rättade saldot.
  let membersCall = 0;
  await page.route("**/api/members", (route) => {
    membersCall++;
    const spentStars = membersCall === 1 ? 15 : 0;
    return route.fulfill({ json: [childMember(spentStars)] });
  });

  // members/events-SSE-strömmen: "connected" (hoppas över av initialConnect,
  // se members.ts) följt av ett enda members-changed — simulerar att
  // deletePurchasedReward() på en förälders enhet broadcastat återbetalningen.
  let eventsRequested = 0;
  await page.route("**/api/members/events", (route) => {
    eventsRequested++;
    return route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body: "event: connected\ndata: {}\n\nevent: members-changed\ndata: {}\n\n",
    });
  });

  await page.goto("/");

  const totalStars = page.locator(".child-stars-stat--total strong");
  const wallet = page.getByRole("button", { name: /Plånbok —/ });

  // Innan återbetalningen: 20 - 15 = 5 tillgängliga stjärnor/kronor.
  await expect(totalStars).toHaveText(/5$/);
  await expect(wallet).toHaveAccessibleName("Plånbok — 5 kr");

  // Vänta in att SSE-strömmen faktiskt anropats (utlöser members-refetch #2).
  await expect.poll(() => eventsRequested).toBeGreaterThan(0);

  // Efter återbetalningen: 20 - 0 = 20 tillgängliga stjärnor/kronor — utan reload.
  await expect(totalStars).toHaveText(/20$/);
  await expect(wallet).toHaveAccessibleName("Plånbok — 20 kr");
});
