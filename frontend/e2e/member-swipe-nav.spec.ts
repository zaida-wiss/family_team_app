import { test, expect } from "@playwright/test";

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

async function mockCommon(page: import("@playwright/test").Page) {
  // Säkerhetsnät (2026-08-10) — samma fynd/fix som e2e/helpers.ts:s
  // mockDataAPIs: den här filen har sin EGEN, fristående mockCommon() (inte
  // den delade helpern) som saknade flera nyare, globalt hämtade endpoints
  // (t.ex. GET /api/recipes, hämtas av useShellState oavsett aktiv panel
  // sedan 2026-07-26). Ett sådant omockat anrop faller igenom till ett
  // RIKTIGT nätverksanrop — lokalt proxar vite preview det vidare till en
  // äkta backend på :3000, och råkar en sådan redan vara igång (t.ex. en
  // annan parallell Claude Code-session) svarar den med ett ÄKTA 401.
  // client.ts:s performRequest/handleUnauthorized behandlar VILKET 401 som
  // helst som "hela sessionen ogiltig" och loggar ut HELA appen — vilket
  // sedan såg ut som slumpmässig "element detached from DOM"-flakighet i
  // just DEN HÄR filens tester, fast grundorsaken var en saknad mock, inte
  // DOM-timing. Registrerad FÖRST (lägst prioritet, Playwright kör senast
  // registrerade matchning först) så alla mer specifika mockningar nedan
  // fortsätter gälla oförändrat.
  await page.route("**/api/**", (route) => {
    if (route.request().url().includes("/api/auth/")) {
      return route.fallback();
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [PARENT, CHILD] }));
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE, CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased/, (route) => route.fulfill({ json: [] }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/audit-log**", (route) => route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } }));
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/todo-templates/**", (route) => route.fulfill({ json: [] }));
}

test("marginal-drag: nedtryck i vänster marginal + drag till höger sida byter till FÖREGÅENDE medlem", async ({ page }) => {
  // TEMP DIAGNOSTIK (tas bort igen efter felsökning) — samlar (inte bara
  // skriver ut) de temporära [swipe-debug]-loggarna OCH eventuella
  // uncaught page errors, så de kan bakas in i felmeddelandet nedan.
  // page.on("console")-utskrift till stdout syns bara i CI-jobbets RÅA
  // loggar, som kräver adminrättigheter att ladda ner (bekräftat 403/401)
  // — men en text inbakad i själva assertion-felet syns fritt i GitHub
  // Actions annotations, utan auth.
  const swipeDebugLog: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().includes("[swipe-debug]")) swipeDebugLog.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await mockCommon(page);
  await page.goto("/");

  // Hem → Visa medlemmar → Nova (aktiveMembers-ordningen är vuxna-först-
  // sedan-barn, alltså [Testförälder, Nova] — Nova är index 1).
  await page.getByRole("button", { name: "Visa medlemmar" }).click();
  await page.getByRole("group", { name: "Medlemslista" }).getByRole("button", { name: "Nova" }).click();
  await expect(page.getByText("Hej Nova!")).toBeVisible();

  const dashboard = page.locator(".child-dashboard");
  const box = await dashboard.boundingBox();
  if (!box) throw new Error("Dashboard hittades inte");

  // TEMP DIAGNOSTIK — jämför wrapper-diven (memberSwipeNavRef, den som
  // faktiskt lyssnar på pointerdown/margin-kollen) mot .child-dashboard
  // (det som testet mäter box mot) — en teori värd att utesluta: om de INTE
  // har samma rect.left/width matchar inte marginal-beräkningen i
  // useMemberSwipeNav.ts:s onPointerDown mot samma koordinater testet
  // klickar på.
  const wrapperRect = await page.evaluate(() => {
    const article = document.querySelector(".child-dashboard");
    const wrapper = article?.parentElement;
    if (!wrapper) return null;
    const r = wrapper.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width };
  });

  // TEMP DIAGNOSTIK — box.y kom tillbaka som exakt 720 (== viewportens
  // höjd) i en tidigare körning: .child-dashboard renderas alltså en hel
  // skärmhöjd UNDER synligt område, vilket förklarar 0 [swipe-debug]-loggar
  // (musen träffar tom yta). Misstanke: en scrollbar förfaders scrollTop
  // nollställs inte vid panelbytet Hem→members. Går uppåt från
  // .child-dashboard och loggar varje förfaders scrollTop/overflow.
  const scrollDiag = await page.evaluate(() => {
    const out: Array<{ tag: string; cls: string; scrollTop: number; overflowY: string }> = [];
    let cur: Element | null = document.querySelector(".child-dashboard");
    while (cur) {
      const style = getComputedStyle(cur);
      out.push({
        tag: cur.tagName,
        cls: typeof cur.className === "string" ? cur.className.slice(0, 60) : "",
        scrollTop: (cur as HTMLElement).scrollTop,
        overflowY: style.overflowY
      });
      cur = cur.parentElement;
    }
    return {
      windowScrollY: window.scrollY,
      docScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      ancestors: out
    };
  });

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
  //
  // TEMP DIAGNOSTIK (tas bort igen efter felsökning) — testet har failat
  // deterministiskt i CI sedan funktionen skrevs, men CI:s riktiga
  // trace/skärmdump kräver admin-rättigheter att ladda ner (401/403 mot
  // GitHub API utan token) och går inte att hämta programmatiskt. GitHub
  // Actions "github"-reporterns ANNOTATIONS är däremot fritt läsbara utan
  // auth (bekräftat) — ett try/catch som bakar in sidans faktiska text
  // OCH nuvarande URL i själva felmeddelandet ger alltså diagnostik gratis,
  // utan att någon behöver ladda ner/packa upp en artefakt manuellt.
  try {
    await expect(page.getByText("Hej Testförälder!")).toBeVisible({ timeout: 15000 });
  } catch (err) {
    const url = page.url();
    const bodyText = await page
      .locator("body")
      .innerText()
      .catch((e) => "(kunde inte läsa body: " + e + ")");
    throw new Error(
      "\"Hej Testförälder!\" blev aldrig synlig. URL: " + url +
      "\nwrapperRect (parent av .child-dashboard): " + JSON.stringify(wrapperRect) +
      "\nboundingBox (.child-dashboard, det testet mätte mot): " + JSON.stringify(box) +
      "\nscrollDiag (window/dokument/förfäders scrollTop uppåt från .child-dashboard): " +
      JSON.stringify(scrollDiag, null, 1) +
      "\n[swipe-debug]-loggar (" + swipeDebugLog.length + " st):\n" + swipeDebugLog.join("\n") +
      "\npageerror (" + pageErrors.length + " st):\n" + pageErrors.join("\n") +
      "\nSidans text vid timeout (första 1500 tecken):\n" + bodyText.slice(0, 1500) +
      "\n\nUrsprungligt fel: " + err
    );
  }
  await expect(page.getByText("Hej Nova!")).toHaveCount(0);
});

test("marginal-drag: ett kort drag som inte når andra sidan byter INTE medlem", async ({ page }) => {
  await mockCommon(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Visa medlemmar" }).click();
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

  await page.getByRole("button", { name: "Visa medlemmar" }).click();
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
