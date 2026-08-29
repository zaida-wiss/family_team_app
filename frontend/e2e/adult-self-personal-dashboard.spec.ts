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

// 2026-08-16, Zaida: "vi behöver mer kontrast på delmomenten i dashboarden"
// — PersonalDashboard.tsx återanvänder .child-dashboard theme-${dashboardTheme},
// men en vuxens dashboardTheme är ett VANLIGT VUXENTEMA (t.ex. "dusk"), inte
// ett av de tio riktiga barntemana i themes.css:s CHILD THEME TOKENS-block.
// Två senare uppföljningar samma dag ändrade den slutgiltiga lösningen: en
// solid kortbakgrund (istället för en för subtil halo), och sedan (Zaida:
// "är det möjligt att få dem i färgtemat istället?") en riktig temafärg
// (--primary-dark, den enda av märkesfärgs-tokenerna som varken rörs av
// .child-dashboard[class*="theme-"]-omdefinieringen eller skiljer sig
// mellan ljust/mörkt läge) istället för den tidigare bleka --background.
// Verifierar att kortets bakgrund matchar temats --primary-dark och att
// texten är vit — inte ett hårdkodat svart, och inte den gamla, otematiserade
// --background/--foreground-kombinationen.
test("delmoment-kortets bakgrund/text på en vuxens PersonalDashboard bär temats --primary-dark/vit, inte ett hårdkodat svart eller en otematiserad bakgrund", async ({ page }) => {
  const larsTodoWithSubtask = {
    ...LARS_TODO,
    subtasks: [{ id: "sub-1", title: "🧺Diska", done: false, assignedTo: "mem-1" }]
  };
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) =>
    route.fulfill({ json: [{ ...PARENT, dashboardTheme: "dusk", darkMode: true }, OTHER_ADULT] })
  );
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO, larsTodoWithSubtask] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Testförälder" }).click();

  const card = page.locator(".child-task-card--subtask");
  await expect(card).toBeVisible();
  const { cardColor, cardBg, expectedPrimaryDark } = await card.evaluate((el) => {
    const name = el.querySelector(".child-task-name")!;
    return {
      cardColor: getComputedStyle(name).color,
      cardBg: getComputedStyle(el).backgroundColor,
      expectedPrimaryDark: getComputedStyle(document.querySelector(".app-shell")!).getPropertyValue("--primary-dark"),
    };
  });
  const resolvedPrimaryDark = await page.evaluate((v) => {
    const el = document.createElement("div");
    el.style.color = v;
    document.body.appendChild(el);
    const resolved = getComputedStyle(el).color;
    el.remove();
    return resolved;
  }, expectedPrimaryDark);
  expect(cardBg).toBe(resolvedPrimaryDark);
  expect(cardColor).toBe("rgb(255, 255, 255)");
});

// 2026-08-29, Zaida: "vissa av todo korten fått låg kontrast, jag kan inte
// läsa" — samma bugklass som delmoment-kortstestet ovan, men för det VANLIGA
// kategorilösa uppdragskortet (getTaskStyle(), ChildTasksSection.tsx):
// --task-bg blev --card (läge-/temaberoende, mörk i mörkt läge) men
// .child-task-name hade fortfarande hårdkodad svart text — osynlig här.
// Verifierar att titeln nu är VIT (--on-c4), inte det gamla hårdkodade
// svarta, på ett kategorilöst kort i mörkt läge.
test("kategorilöst uppdragskorts titel är läsbar (vit) på en vuxens PersonalDashboard i mörkt läge, inte hårdkodat svart", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) =>
    route.fulfill({ json: [{ ...PARENT, dashboardTheme: "dusk", darkMode: true }, OTHER_ADULT] })
  );
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Testförälder" }).click();

  const card = page.locator(".child-task-card").filter({ hasText: "Handla mat" });
  await expect(card).toBeVisible();
  const titleColor = await card.locator(".child-task-name").evaluate((el) => getComputedStyle(el).color);
  expect(titleColor).toBe("rgb(255, 255, 255)");
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

// 2026-08-30, backlogg-fynd (2026-08-29): Rekord-sidan (ChildRecordsPage.tsx,
// delar .child-dashboard-klassen med både riktiga barn OCH en vuxens
// PersonalDashboard, se Rekord-testet ovan om samma delade komponentyta)
// hade samma "hårdkodad textfärg mot en läge-beroende bakgrund"-buggklass
// som redan hittats och fixats två gånger för uppdragskorten (delmoment
// 2026-08-16, kategorilöst kort 2026-08-29): .child-timed-tasks__card
// blandade --card (mörk i mörkt läge) i sin bakgrund men
// .child-timed-tasks__name/__status hade fortfarande hårdkodad svart text.
// Fixat genom att blanda --white istället för --card (samma mönster som de
// RIKTIGA kategoriserade uppdragskortens --cat-*-bg, themes.css, redan
// alltid blandade mot --white) — kortet förblir en ljus pastellyta oavsett
// läge, ingen egen läge-medveten textfärg behövs. Verifierar den FAKTISKA
// getComputedStyle-bakgrunden mot en riktigt DOM-resolvad "vit blandad med
// temats accentfärg", inte en gissad hex.
const TIMED_TASK = {
  id: "tt-1", accountId: "acc-1", title: "Springa ett varv", symbol: "🏃",
  assignedTo: "mem-1", createdBy: "mem-1", deletedAt: null, deletedBy: null,
  bestDurationMs: null, bestAchievedAt: null, attemptCount: 0,
};
test("Rekord-sidans tidtagningskort får en ljus bakgrund (blandad mot --white) i mörkt läge, inte den mörka --card", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) =>
    route.fulfill({ json: [{ ...PARENT, dashboardTheme: "dusk", darkMode: true }, OTHER_ADULT] })
  );
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [TIMED_TASK] }));

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Testförälder" }).click();
  await page.getByRole("button", { name: "Rekord" }).click();

  const card = page.locator(".child-timed-tasks__card").filter({ hasText: "Springa ett varv" });
  await expect(card).toBeVisible();

  const { cardBg, nameColor, resolvedExpectedBg } = await card.evaluate((el) => {
    const name = el.querySelector(".child-timed-tasks__name")!;
    const probe = document.createElement("div");
    probe.style.background =
      "linear-gradient(100deg, color-mix(in srgb, var(--white, #fff) 88%, var(--task-accent, var(--c1)) 12%), color-mix(in srgb, var(--white, #fff) 58%, var(--task-accent, var(--c1)) 42%))";
    el.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundImage;
    probe.remove();
    return {
      cardBg: getComputedStyle(el).backgroundImage,
      nameColor: getComputedStyle(name).color,
      resolvedExpectedBg: resolved,
    };
  });
  expect(cardBg).toBe(resolvedExpectedBg);
  expect(nameColor).toBe("rgb(0, 0, 0)");
});
