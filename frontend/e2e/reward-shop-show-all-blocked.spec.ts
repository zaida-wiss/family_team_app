import { test, expect, type Page } from "@playwright/test";
import { mockDataAPIs } from "./helpers";

// 2026-08-29, Zaidas önskemål: belöningsbutiken ska visa ALLA belöningar
// (inte bara de köpbara just nu), sorterade så att tillgängliga hamnar
// överst, med en förklarande text på de spärrade — t.ex.
// "När du gjort Kvällsrutiner" (kategorispärr) eller "Max 1 st idag —
// redan hämtat" (köpgräns, RewardShopItem.purchaseLimit).

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

const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  approvedStars: 20, spentStars: 0, deletedAt: null, deletedBy: null,
};

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

const CATEGORY = { id: "cat-1", name: "Kvällsrutiner", accountId: "acc-1", createdBy: "mem-parent", deletedAt: null };

const AVAILABLE_ITEM = {
  id: "rsi-available", title: "Biobiljett", symbol: "🎬", starCost: 20, timerMinutes: null,
  availability: null, purchaseLimit: null, requiredCategories: [], createdBy: "mem-parent", deletedAt: null,
};

const BLOCKED_ITEM = {
  id: "rsi-blocked", title: "Extra godis", symbol: "🍬", starCost: 5, timerMinutes: null,
  availability: null, purchaseLimit: null, requiredCategories: ["cat-1"], createdBy: "mem-parent", deletedAt: null,
};

const LIMITED_ITEM = {
  id: "rsi-limited", title: "Skärmtid", symbol: "📱", starCost: 10, timerMinutes: null,
  availability: null, purchaseLimit: { max: 1, period: "day" }, requiredCategories: [], createdBy: "mem-parent", deletedAt: null,
};

// Både tid OCH kategori spärrar samtidigt — startdatum långt fram i tiden
// (deterministiskt, oberoende av vilken veckodag testet råkar köras) OCH ett
// obligatoriskt kategori-uppdrag. Ska visa BÅDA delarna (2026-08-29, Zaidas
// önskemål: "NÄR belöningen är möjlig att köpa, samt vad som krävs").
const FUTURE_AND_BLOCKED_ITEM = {
  id: "rsi-future-blocked", title: "Nyårsfest", symbol: "🎉", starCost: 5, timerMinutes: null,
  availability: { startDate: "2099-01-01", endDate: null, windows: [] },
  purchaseLimit: null, requiredCategories: ["cat-1"], createdBy: "mem-parent", deletedAt: null,
};

// Har ett fönster (alltid tillgänglig tidsmässigt, "alla dagar" oavsett
// veckodag) men spärras ändå av kategorin — schemat ska visas som KONTEXT
// trots att tiden i sig inte är det som blockerar just nu.
const SCHEDULED_AND_BLOCKED_ITEM = {
  id: "rsi-scheduled-blocked", title: "Pyjamaskväll", symbol: "🛌", starCost: 5, timerMinutes: null,
  availability: { startDate: null, endDate: null, windows: [{ daysOfWeek: [], timeIntervals: [] }] },
  purchaseLimit: null, requiredCategories: ["cat-1"], createdBy: "mem-parent", deletedAt: null,
};

// Barnets EGEN, ej godkända kvällsrutin-uppgift — det som blockerar BLOCKED_ITEM.
const PENDING_TODO = {
  id: "todo-1", accountId: "acc-1", title: "Borsta tänderna", createdBy: "mem-parent",
  assignedTo: "mem-child", status: "pending", starValue: 1,
  visual: { type: "lucide-icon", value: "Star" },
  recurrence: { type: "none" }, recurringSourceId: null, occurrenceDate: null,
  completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: "cat-1", notes: null,
};

async function mockChildSession(page: Page) {
  await mockDataAPIs(page);
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [PENDING_TODO] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({
      json: {
        items: [BLOCKED_ITEM, AVAILABLE_ITEM, LIMITED_ITEM, FUTURE_AND_BLOCKED_ITEM, SCHEDULED_AND_BLOCKED_ITEM],
        requireApprovalForCategories: false
      }
    })
  );
  await page.route(/\/api\/reward-shop\/purchase-limits\/mem-child/, (route) =>
    route.fulfill({ json: { "rsi-limited": { count: 1, max: 1, period: "day", reached: true } } })
  );
}

test("Belöningsbutiken visar en kategori-spärrad vara med förklarande text, inte dold", async ({ page }) => {
  await mockChildSession(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Shop" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const blockedCard = page.locator(".reward-shop-card", { hasText: "Extra godis" });
  await expect(blockedCard).toBeVisible();
  await expect(blockedCard).toHaveClass(/reward-shop-card--unavailable/);
  await expect(blockedCard.locator(".reward-shop-card__unavailable-label")).toHaveText("När du gjort Kvällsrutiner");
});

test("Belöningsbutiken visar en köpgräns-nådd vara som spärrad med förklarande text", async ({ page }) => {
  await mockChildSession(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Shop" }).click();

  const limitedCard = page.locator(".reward-shop-card", { hasText: "Skärmtid" });
  await expect(limitedCard).toBeVisible();
  await expect(limitedCard).toHaveClass(/reward-shop-card--unavailable/);
  await expect(limitedCard.locator(".reward-shop-card__unavailable-label")).toHaveText("Max 1 st idag — redan hämtat");
});

test("Tillgängliga belöningar hamnar överst, spärrade längst ner", async ({ page }) => {
  await mockChildSession(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Shop" }).click();

  const titles = await page.locator(".reward-shop-card__title").allTextContents();
  // Tillgänglig (Biobiljett) först, sedan de spärrade sorterade billigast
  // först sinsemellan (Extra godis/Nyårsfest/Pyjamaskväll 5 kr — stabil
  // sortering behåller ursprunglig ordning vid oavgjort, sedan Skärmtid 10 kr).
  expect(titles).toEqual(["Biobiljett", "Extra godis", "Nyårsfest", "Pyjamaskväll", "Skärmtid"]);
});

test("Belöningsbutiken visar BÅDE NÄR belöningen går att köpa och VAD som krävs, samtidigt", async ({ page }) => {
  await mockChildSession(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Shop" }).click();

  // Tiden är den aktiva spärren (startdatum 2099) OCH kategorin krävs — båda ska synas.
  const futureCard = page.locator(".reward-shop-card", { hasText: "Nyårsfest" });
  await expect(futureCard.locator(".reward-shop-card__unavailable-label"))
    .toHaveText(/dagar kvar · När du gjort Kvällsrutiner/);

  // Tiden blockerar INTE just nu (fönstret gäller alla dagar/hela dagen),
  // men schemat ska ändå visas som kontext bredvid kategorikravet.
  const scheduledCard = page.locator(".reward-shop-card", { hasText: "Pyjamaskväll" });
  await expect(scheduledCard.locator(".reward-shop-card__unavailable-label"))
    .toHaveText("Tillgänglig: alla dagar · När du gjort Kvällsrutiner");
});
