import { test, expect } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// Zaida (2026-08-09): "man skall kunna bläddra mellan olika
// familjemedlemmar i childrens timeline/todo genom att svepa med ett
// finger vågrät över skärmen, och i desktop genom att klicka i höger eller
// vänster marginal och dra den nedtryckta markören över till andra sidan
// innan man släpper." Testar desktop-varianten (marginal-drag) — enklast
// att simulera pålitligt via page.mouse, utan att behöva touch-emulering.
// Samma useMemberSwipeNav-hook (frontend/src/hooks/useMemberSwipeNav.ts)
// hanterar båda via Pointer Events, en mus-drag-simulering täcker alltså
// samma kodväg som en riktig touch-baserad drag skulle göra.

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
  avatarUrl: null, color: null, dashboardTheme: "clear",
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: "space",
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };
const LOGIN_RESPONSE = { accessToken: "tok", user: USER, memberships: [{ member: PARENT, account: ACCOUNT }] };

// 2026-08-10: bytt från en egen, lokalt duplicerad bred catch-all (samma
// fynd, en annan session löste det oberoende samtidigt) till den delade
// mockDataAPIs() (helpers.ts) — samma effekt, ingen duplicerad kopia att
// hålla i synk. Se todo-timer.spec.ts:s identiska kommentar för bugklassen.
async function mockCommon(page: import("@playwright/test").Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
}

test("marginal-drag: nedtryck i vänster marginal + drag till höger sida byter till FÖREGÅENDE medlem", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  // Hem → Visa medlemmar → Nova (aktiveMembers-ordningen är vuxna-först-
  // sedan-barn, alltså [Testförälder, Nova] — Nova är index 1).
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();

  const dashboard = page.locator(".child-dashboard");
  const box = await dashboard.boundingBox();
  if (!box) throw new Error("Dashboard hittades inte");

  // Nedtryck i VÄNSTER marginal (nära box.x), drag hela vägen till HÖGER
  // sida — nettoriktning åt höger = föregående medlem (samma
  // karusell-konvention som touch-svepet, se useMemberSwipeNav.ts).
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  // PersonalDashboard är lazy-laddad (MemberShellContent.tsx) och har ännu
  // inte hämtats i den här testsessionen (bara ChildDashboard/Nova besökt
  // hittills) — utöver commit()s egen 200ms-animation tillkommer en riktig
  // JS-chunk-hämtning första gången, som under CI:s fulla parallellitet kan
  // ta längre än standardens 5000ms. Generös timeout, samma resonemang som
  // getBadge i child-uncomplete-badge.spec.ts.
  await expect(page.getByText("Hej Testförälder!")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Hej Nova!")).toHaveCount(0);
});

test("marginal-drag: ett kort drag som inte når andra sidan byter INTE medlem", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();

  const dashboard = page.locator(".child-dashboard");
  const box = await dashboard.boundingBox();
  if (!box) throw new Error("Dashboard hittades inte");

  // Bara en kort bit av bredden, inte "hela vägen över till andra sidan".
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByText("Hej Nova!")).toBeVisible();
});

test("marginal-drag: nedtryck MITT i vyn (inte i marginalen) triggar ingen växling", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();

  const dashboard = page.locator(".child-dashboard");
  const box = await dashboard.boundingBox();
  if (!box) throw new Error("Dashboard hittades inte");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByText("Hej Nova!")).toBeVisible();
});

// 2026-08-23, Zaida: "det skall vara som att vända blad i en e-bok" —
// touch-varianten (till skillnad från mus-marginaldraget ovan) tracker nu
// fingret LEVANDE under draget (beginPeel/updatePeel i useMemberSwipeNav.ts)
// istället för att bara reagera vid släpp. Simuleras här med dispatchEvent
// + pointerType:"touch" (samma mönster som redan används för håll-in-gester
// i todo-timer.spec.ts) eftersom page.mouse alltid ger pointerType:"mouse".
// bubbles:true krävs eftersom eventen dispatchas på .child-dashboard men
// själva lyssnaren sitter på dess omslutande <div ref={memberSwipeNavRef}>.
test("touch-svep: en fullbordad vändning följer fingret och byter medlem", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();

  const box = await page.locator(".child-dashboard").boundingBox();
  if (!box) throw new Error("Dashboard hittades inte");
  // Events dispatchas på den STABILA svep-wrappern (data-testid, samma nod
  // hela gesten) — INTE på .child-dashboard, som beginPeel byter ut mitt i
  // (key={member.id} tvingar React att montera om HELA .child-dashboard-
  // subträdet vid ett medlemsbyte, se MemberShellContent.tsx). Ett tidigare
  // försök som fångade .child-dashboard direkt tappade resten av draget
  // eftersom den noden hann bli frånkopplad (detached) så fort första
  // pointermove-eventet triggade det optimistiska bytet.
  const wrapperHandle = await page.getByTestId("member-swipe-area").elementHandle();
  if (!wrapperHandle) throw new Error("Svep-wrapper hittades inte");
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await wrapperHandle.dispatchEvent("pointerdown", {
    pointerId: 1, pointerType: "touch", clientX: startX, clientY: y, bubbles: true
  });
  // Stigande vågrät förflyttning åt vänster — kryssar både axel-tröskeln
  // (8px, påbörjar peelen) och sedan SWIPE_COMMIT_RATIO (30% av bredden).
  for (const fraction of [0.05, 0.2, 0.4, 0.65]) {
    await wrapperHandle.dispatchEvent("pointermove", {
      pointerId: 1, pointerType: "touch", clientX: startX - box.width * fraction, clientY: y, bubbles: true
    });
  }
  await wrapperHandle.dispatchEvent("pointerup", {
    pointerId: 1, pointerType: "touch", clientX: startX - box.width * 0.65, clientY: y, bubbles: true
  });

  // Samma generösa timeout som marginal-drag-testet ovan (PersonalDashboard
  // lazy-laddas första gången). getByRole (inte getByText) eftersom
  // ögonblicksbilden är en FULL klon av samma rubrik-DOM — bara aria-hidden
  // skiljer dem åt, och getByRole utesluter (till skillnad från getByText)
  // aria-hidden-innehåll ur tillgänglighetsträdet, så assertionen inte
  // flakar under den korta stunden innan städningen (snapshot.remove())
  // hunnit köras.
  await expect(page.getByRole("heading", { name: "Hej Testförälder!" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Hej Nova!" })).toHaveCount(0);
});

test("touch-svep: ett kort drag under tröskeln fjädrar tillbaka och byter INTE medlem", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();

  const box = await page.locator(".child-dashboard").boundingBox();
  if (!box) throw new Error("Dashboard hittades inte");
  // Se kommentaren i föregående test — samma resonemang om varför events
  // dispatchas på den stabila svep-wrappern, inte på .child-dashboard.
  const wrapperHandle = await page.getByTestId("member-swipe-area").elementHandle();
  if (!wrapperHandle) throw new Error("Svep-wrapper hittades inte");
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await wrapperHandle.dispatchEvent("pointerdown", {
    pointerId: 1, pointerType: "touch", clientX: startX, clientY: y, bubbles: true
  });
  // Bara 10% av bredden — förbi axel-tröskeln (så en peel FAKTISKT
  // påbörjas, medlemmen byts redan här bakom ögonblicksbilden, se
  // beginPeel) men långt under SWIPE_COMMIT_RATIO (30%).
  for (const fraction of [0.03, 0.06, 0.1]) {
    await wrapperHandle.dispatchEvent("pointermove", {
      pointerId: 1, pointerType: "touch", clientX: startX - box.width * fraction, clientY: y, bubbles: true
    });
  }
  await wrapperHandle.dispatchEvent("pointerup", {
    pointerId: 1, pointerType: "touch", clientX: startX - box.width * 0.1, clientY: y, bubbles: true
  });

  // settlePeel fjädrar tillbaka och ångrar det tidiga bytet (osynligt
  // bakom den återställda ögonblicksbilden) — den KRITISKA delen att
  // verifiera, eftersom mus-testerna ovan aldrig byter medlem tidigt.
  // getByRole, inte getByText — se kommentaren i föregående test.
  await expect(page.getByRole("heading", { name: "Hej Nova!" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Hej Testförälder!" })).toHaveCount(0);
});
