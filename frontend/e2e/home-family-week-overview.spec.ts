import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// 2026-08-29, Zaidas önskemål efter en mockup-bild av ett nytt
// "familjeläge": avatarrad + veckans rutiner (en liten rad per
// familjemedlem, dämpade ikoner för ogjort, odämpade för klart) + barnens
// stjärnor — ersätter den tidigare "Visa medlemmar"-fliken som Hem-panelens
// standardvy (se useHomeTabNavSync.ts/MemberOverview.tsx). Se
// todos/selectors.ts:s getFamilyWeekRoutines för urvalslogiken.

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function toLocalDateStr(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const CHILD_ROLE = { id: "role-child", name: "Barn", isChildRole: true, permissions: {} };
const CHILD = {
  id: "mem-child", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: "#ff3366", dashboardTheme: null,
  approvedStars: 4, spentStars: 1, deletedAt: null, deletedBy: null
};

function todo(overrides: Record<string, unknown>) {
  return {
    accountId: "acc-1", createdBy: "mem-1", assignedTo: CHILD.id, isShared: false,
    status: "pending", starValue: 0, visual: { type: "lucide-icon", value: "⭐" },
    recurrence: { type: "none" }, recurringSourceId: null, occurrenceDate: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null,
    ...overrides
  };
}

test("Hem-panelens standardvy (ingen flik klickad) visar medlemmar, veckans rutiner och barnens stjärnor direkt", async ({ page }) => {
  const today = new Date();
  const todayWeekday = WEEKDAY_NAMES[today.getDay()];
  const todayStr = toLocalDateStr(today);

  const TEMPLATE = todo({
    id: "template-1", title: "Borsta tänderna",
    recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: [todayWeekday] },
    visibleFrom: "2026-01-01T00:00:00.000Z",
    visual: { type: "lucide-icon", value: "🦷" }
  });
  // En redan avklarad/godkänd occurrence för idag — ska visas ODÄMPAD.
  const DONE_OCCURRENCE = todo({
    id: "template-1-occurrence-today", title: "Borsta tänderna",
    recurringSourceId: "template-1", occurrenceDate: todayStr, status: "approved",
    visual: { type: "lucide-icon", value: "🦷" }
  });
  // En andra mall, samma veckodag, UTAN någon occurrence än — ska visas DÄMPAD.
  const TEMPLATE_2 = todo({
    id: "template-2", title: "Häng upp jackan",
    recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: [todayWeekday] },
    visibleFrom: "2026-01-01T00:00:00.000Z",
    visual: { type: "lucide-icon", value: "🧥" }
  });

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [{ id: "role-1", name: "Förälder", isChildRole: false, permissions: {} }, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: [TEMPLATE, DONE_OCCURRENCE, TEMPLATE_2] });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/");

  // Medlemsavataren — ingen flik klickad, standardvyn visar den direkt.
  await expect(page.getByRole("group", { name: "Medlemslista" }).getByText("Nova")).toBeVisible();

  // Barnens stjärnor — exakt Nova.approvedStars, oavsett spentStars.
  const starsSection = page.locator(".family-children-stars");
  await expect(starsSection).toBeVisible();
  await expect(starsSection.getByText("Nova")).toBeVisible();
  await expect(starsSection.getByText("4 godkända stjärnor")).toBeVisible();

  // Veckans rutiner — en klar (odämpad) och en ogjord (dämpad) ikon samma dag.
  const routines = page.locator(".family-week-routines");
  await expect(routines).toBeVisible();
  const doneIcon = routines.locator(".family-week-routines__icon--done");
  await expect(doneIcon).toHaveCount(1);
  await expect(doneIcon).toContainText("🦷");
  const undoneIcon = routines.locator(".family-week-routines__icon:not(.family-week-routines__icon--done)");
  await expect(undoneIcon.filter({ hasText: "🧥" })).toHaveCount(1);
});

test("Veckans rutiner visar även veckans kalenderhändelser, en rad per dag med tid + titel", async ({ page }) => {
  const today = new Date();
  const todayStr = toLocalDateStr(today);

  const CALENDAR = {
    id: "cal-1", name: "Familjekalender", ownerId: "mem-1", color: "#2f7d6d",
    sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
    importedSources: [], subscriptions: [],
    events: [
      {
        id: "ev-1", calendarId: "cal-1", title: "Tandläkare",
        startsAt: `${todayStr}T14:30:00.000Z`, endsAt: `${todayStr}T15:00:00.000Z`,
        isAllDay: false, color: null, uid: null, location: null, notes: null,
        recurrence: { type: "none" }, attendees: [], symbol: null,
        createdBy: "mem-1", deletedAt: null, deletedBy: null,
      },
    ],
  };

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [CALENDAR] }));
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");

  const routines = page.locator(".family-week-routines");
  await expect(routines).toBeVisible();
  const eventRow = routines.locator(".family-week-routines__event", { hasText: "Tandläkare" });
  await expect(eventRow).toBeVisible();
  await expect(eventRow.locator(".family-week-routines__event-time")).not.toHaveText("");
});

test("Veckans rutiner döljer en kategori märkt excludeFromWeekOverview och visar dagens datum bredvid veckodagsnamnet", async ({ page }) => {
  const today = new Date();
  const todayWeekday = WEEKDAY_NAMES[today.getDay()];

  const CATEGORY_ROUTINES = {
    id: "cat-routines", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
    createdAt: "2026-01-01T00:00:00.000Z", excludeFromWeekOverview: true
  };
  const CATEGORY_OTHER = {
    id: "cat-other", accountId: "acc-1", memberId: "mem-1", name: "Läxor",
    createdAt: "2026-01-01T00:00:00.000Z", excludeFromWeekOverview: false
  };
  const TEMPLATE_EXCLUDED = todo({
    id: "template-excluded", title: "Bädda sängen", personalCategoryId: "cat-routines",
    recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: [todayWeekday] },
    visibleFrom: "2026-01-01T00:00:00.000Z", visual: { type: "lucide-icon", value: "🛏️" }
  });
  const TEMPLATE_VISIBLE = todo({
    id: "template-visible", title: "Läs läxa", personalCategoryId: "cat-other",
    recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: [todayWeekday] },
    visibleFrom: "2026-01-01T00:00:00.000Z", visual: { type: "lucide-icon", value: "📚" }
  });

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [{ id: "role-1", name: "Förälder", isChildRole: false, permissions: {} }, CHILD_ROLE] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY_ROUTINES, CATEGORY_OTHER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TEMPLATE_EXCLUDED, TEMPLATE_VISIBLE] }));

  await page.goto("/");

  const routines = page.locator(".family-week-routines");
  await expect(routines).toBeVisible();
  await expect(routines.getByText("📚")).toBeVisible();
  await expect(routines.getByText("🛏️")).toHaveCount(0);

  // Dagens datum syns bredvid veckodagsnamnet — inte längre bara "Måndag" etc.
  const todayLabel = routines.locator(".family-week-routines__day--today .family-week-routines__day-date");
  await expect(todayLabel).toBeVisible();
  await expect(todayLabel).not.toHaveText("");
});

test("Inställningar → Familj → Dashboard: avmarkera en kategori sätter excludeFromWeekOverview via PATCH", async ({ page }) => {
  const CATEGORY = {
    id: "cat-routines", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
    createdAt: "2026-01-01T00:00:00.000Z", excludeFromWeekOverview: false
  };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));

  let patchBody: unknown = null;
  await page.route("**/api/todo-categories/cat-routines/exclude-from-week-overview", (route) => {
    patchBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Familj", exact: true }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();

  const row = page.getByText("Rutiner", { exact: false }).locator("..");
  const checkbox = row.getByRole("checkbox");
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();

  await expect.poll(() => patchBody).toEqual({ exclude: true });
});

// 2026-08-30, uppföljning samma dag: "Lördagar och söndagar skall få en
// färg som sticker ut lite lätt för att visa att det är helg då" — en egen
// bakgrundston (fast bärnstensfärg, oberoende av tema/mörkt läge, se
// FamilyWeekRoutines.css:s kommentar om varför ett första försök med
// --secondary var näst intill osynligt i mörkt läge) på lördag/söndag,
// skild från "idag"-markeringen (grön/primary).
//
// 2026-08-31: fönstret krympte från 7 till 3 dagar (idag + 2, se
// getFamilyWeekRoutines) — att som tidigare LETA efter en helgdag bland
// dagens faktiska datum är därför inte längre garanterat att lyckas (kan
// t.ex. vara måndag, dag 1/2 blir då tisdag/onsdag, ingen helg alls i
// fönstret). "Idag" pinnas istället till en känd lördag via page.clock
// (samma mönster som redan används i home-todos-claim.spec.ts) — ger
// deterministiskt dag0=lördag(idag+helg), dag1=söndag(helg, inte idag),
// dag2=måndag(vardag) i samma körning, utan att gissa på det verkliga datumet.
test("Veckans rutiner: lördag/söndag får en egen bakgrundsfärg, skild från en vanlig veckodag", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-05T12:00:00") }); // lördag
  const TEMPLATE = todo({
    id: "template-1", title: "Diska", assignedTo: MEMBER.id,
    recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: WEEKDAY_NAMES },
    visibleFrom: "2026-01-01T00:00:00.000Z", visual: { type: "lucide-icon", value: "🍽️" }
  });

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TEMPLATE] }));

  await page.goto("/");
  const routines = page.locator(".family-week-routines");
  await expect(routines).toBeVisible();

  const days = routines.locator(".family-week-routines__day");
  const todayEl = days.nth(0); // lördag, idag
  const weekendEl = days.nth(1); // söndag, helg men inte idag
  const weekdayEl = days.nth(2); // måndag, vanlig veckodag

  const weekendBg = await weekendEl.evaluate((el) => getComputedStyle(el).backgroundColor);
  const weekdayBg = await weekdayEl.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(weekendBg).not.toBe(weekdayBg);
  // Ren transparent bakgrund (samma som en overiden vardag) hade också
  // räknats som "not toBe" om helgfärgen aldrig applicerats — kolla explicit
  // att helgdagen faktiskt fått en egen klass också.
  await expect(weekendEl).toHaveClass(/family-week-routines__day--weekend/);
  await expect(weekdayEl).not.toHaveClass(/family-week-routines__day--weekend/);

  // Dagens datum (lördag) är BÅDE helg och idag — "idag"-färgen (grön/
  // primary) ska vinna över helgfärgen, inte krocka.
  await expect(todayEl).toHaveClass(/family-week-routines__day--today/);
  await expect(todayEl).toHaveClass(/family-week-routines__day--weekend/);
  const todayBg = await todayEl.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(todayBg).not.toBe(weekendBg);
});

test("Hem-panelen: klick på Kalender och sedan Hem igen landar tillbaka på standardvyn (overview), inte kvar på Kalender", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await expect(page.getByRole("group", { name: "Medlemslista" })).toBeVisible();

  await page.getByRole("tab", { name: "Visa kalender" }).click();
  await expect(page.getByRole("group", { name: "Medlemslista" })).toHaveCount(0);

  await page.getByRole("button", { name: "Hem", exact: true }).click();
  await expect(page.getByRole("group", { name: "Medlemslista" })).toBeVisible();
});
