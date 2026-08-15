import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Zaida (2026-07-22): "Som vuxen ser jag ingen barnvy när jag klickar på min
// profil på medlemsvyn. Jag vill kunna se mina uppgifter och kalendrar på
// samma sätt som barnen gör när jag trycker på min profilbild inne i
// familjemedlemmars vyn." Ny PersonalDashboard.tsx återanvänder ChildDashboards
// underkomponenter (timeline, veckoremsa, uppgiftskort med håll-in) utan
// stjärnor/belöningsbutik, som inte gäller en vuxens egna uppgifter.
//
// 2026-07-27, Zaidas fynd: "får alla vuxna även en barnvy? Nu står Lars som
// förälder och han får ingen barnvy" — 2026-07-22-beslutets undantag för
// "väljer man en ANNAN vuxen visas ändå den vanliga hemvyn" reverserat.
// Andra testet nedan uppdaterat till det NYA beteendet (visade tidigare det
// omvända).
//
// 2026-08-10: migrerad från en egen, lokal mockCommon() till den delade
// mockAuthAndData()/mockDataAPIs() (helpers.ts) — filens ursprungliga mock
// saknade flera endpoints som lagts till sedan 2026-07-22 (todo-templates,
// recipes, family-across-accounts, connections m.fl.), vilket lät dem falla
// igenom till ett RIKTIGT, ej mockat nätverksanrop och ett äkta 401 →
// appen loggade ut mitt i testet (upptäckt vid felsökning av en till synes
// "flakig" körning — screenshoten visade inloggningssidan, inte instabil
// DOM-timing). Samma redan dokumenterade bugklass som helpers.ts:s egen
// mockDataAPIs-kommentar beskriver. Den delade hjälparen håller sig
// uppdaterad automatiskt när nya endpoints tillkommer, till skillnad från
// en lokal kopia.
const PARENT = { ...MEMBER, dashboardTheme: "sunset" };
const OTHER_ADULT = {
  id: "mem-2", accountId: "acc-1", userId: "user-2",
  name: "Lars", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const TODO = {
  id: "todo-1", accountId: "acc-1", title: "Handla mat", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null
};
const LARS_TODO = { ...TODO, id: "todo-2", title: "Klippa gräset", createdBy: "mem-2", assignedTo: "mem-2" };

async function mockCommon(page: import("@playwright/test").Page) {
  await mockAuthAndData(page);
  // Registrerade EFTER mockAuthAndData (Playwright: senast registrerad
  // matchning vinner) — testets egna, mer specifika data ersätter de
  // generiska default-stubbarna för just members/todos.
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER_ADULT] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO, LARS_TODO] }));
}

test("vuxen som klickar sin egen profil ser sina uppgifter+kalender, inte Familjens kalender", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  // Hem-vyns egen "Visa medlemmar"-popup (ersätter sedan 2026-08-09
  // HeroBar.tsx:s borttagna Medlemmar-nav-ikon) — portalerad till
  // document.body, scopad via role="group"-behållaren för att undvika en
  // strict-mode-krock med andra "Testförälder"-förekomster på sidan.
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Testförälder" }).click();

  await expect(page.getByText("Hej Testförälder!")).toBeVisible();
  await expect(page.getByText("Handla mat")).toBeVisible();
  await expect(page.getByText("Familjens kalender")).toHaveCount(0);
});

test("vuxen som klickar en ANNAN vuxens profil ser NU den personens uppgifter+kalender också", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Lars" }).click();

  await expect(page.getByText("Hej Lars!")).toBeVisible();
  await expect(page.getByText("Klippa gräset")).toBeVisible();
  await expect(page.getByText("Handla mat")).toHaveCount(0);
  await expect(page.getByText("Familjens kalender")).toHaveCount(0);
});

// 2026-08-10, PersonalDashboard-uppföljning (öppen backlogg-post): redigera-
// knapp på uppdragskortet, MEDVETET bara på DIN EGEN dashboard — ingen
// befintlig behörighetsprincip för att redigera en ANNAN vuxens uppgifter
// härifrån (Zaidas beslut). ChildTasksSection.tsx delas rakt av med RIKTIGA
// barns dashboard, så knappen är opt-in via en valfri prop som bara
// PersonalDashboard.tsx sätter.
test("vuxen ser en redigera-knapp på sin EGEN dashboard, öppnar redigeringsmodalen", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Testförälder" }).click();

  await expect(page.getByText("Handla mat")).toBeVisible();
  // exact:true (2026-08-10) — kortets EGEN tillgängliga namn ("Star Handla
  // mat Redigera") innehåller redan den nästlade knappens namn som en
  // delsträng (role="button"-namnet beräknas från allt textinnehåll,
  // inklusive ättlingar), samma redan dokumenterade tvetydighetsklass som
  // finns på flera andra ställen i sviten.
  await page.getByRole("button", { name: "Redigera Handla mat", exact: true }).click();
  await expect(page.getByText("Redigera uppgift")).toBeVisible();
});

test("vuxen ser INGEN redigera-knapp på en ANNAN vuxens dashboard", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Lars" }).click();

  await expect(page.getByText("Klippa gräset")).toBeVisible();
  await expect(page.getByRole("button", { name: "Redigera Klippa gräset", exact: true })).toHaveCount(0);
});

// 2026-08-12, Zaidas önskemål: "delmoment man är signad på hamnar på
// dashboarden, gärna emojin vid start med" — ett delmoment tilldelat mig
// dyker upp som ett eget uppdragskort på MIN dashboard, även om HELA todon
// tillhör någon annan (här: Lars "Klippa gräset"). Håll-in i två sekunder
// bockar av delmomentet, precis som ett vanligt uppdragskort kompletterar
// hela todon.
test("vuxen ser ett uppdragskort för ett delmoment tilldelat DEM, med emojin som ikon; håll-in bockar av det", async ({ page }) => {
  let toggledSubtaskId: string | null = null;
  const larsTodoWithSubtask = {
    ...LARS_TODO,
    subtasks: [{ id: "sub-1", title: "🧺Diska", done: false, assignedTo: "mem-1" }]
  };
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER_ADULT] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO, larsTodoWithSubtask] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-2/subtasks/sub-1", (route) => {
    toggledSubtaskId = "sub-1";
    return route.fulfill({ json: { done: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Testförälder" }).click();

  // "Klippa gräset" (hela todon) tillhör Lars och ska INTE synas — bara
  // dess delmoment, som ett eget kort med emojin extraherad ur titeln.
  await expect(page.getByText("Handla mat")).toBeVisible();
  await expect(page.getByText("Klippa gräset")).toHaveCount(0);
  const subtaskCard = page.getByRole("button", { name: /Diska/ });
  await expect(subtaskCard).toBeVisible();
  await expect(subtaskCard.locator(".child-task-icon")).toHaveText("🧺");

  await subtaskCard.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });
  await expect.poll(() => toggledSubtaskId, { timeout: 3000 }).toBe("sub-1");
});

// 2026-08-15, Zaida: "oavsett delmoment eller uppgift så vill jag ha en ikon
// som visar att jag klarat av den på min tidslinje" — den lodräta
// tidslinjen (ChildTimeline.tsx, delad med barnens dashboard) kände
// tidigare bara till avklarade HELA todos, aldrig delmoment. Verifierar att
// en vuxens EGEN tidslinje nu visar en pin för båda: en hel avklarad todo
// (mem-1s egen) OCH ett delmoment (på Lars todo, tilldelat mem-1).
const NOW_ISO = new Date().toISOString();
const COMPLETED_TODO = { ...TODO, status: "approved", completedAt: NOW_ISO };
const LARS_TODO_WITH_COMPLETED_SUBTASK = {
  ...LARS_TODO,
  subtasks: [{ id: "sub-1", title: "🧺Diska", done: true, assignedTo: "mem-1", completedAt: NOW_ISO }],
};
test("vuxen ser en tidslinje-ikon för både en avklarad hel uppgift och ett avklarat delmoment", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, OTHER_ADULT] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: [COMPLETED_TODO, LARS_TODO_WITH_COMPLETED_SUBTASK] })
  );

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Testförälder" }).click();

  const donePins = page.locator(".child-tl-reward-pin--done");
  await expect(donePins).toHaveCount(2);
  await expect(page.locator(".child-tl-reward-pin--done[title='Handla mat']")).toBeVisible();
  await expect(page.locator(".child-tl-reward-pin--done[title='Diska']")).toBeVisible();
});
