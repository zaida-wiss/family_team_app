import type { Page } from "@playwright/test";

const ACCOUNT = { id: "acc-1", name: "Familjen Test", type: "family", createdBy: "mem-1", deletedAt: null };
const ROLE = {
  id: "role-1",
  name: "Förälder",
  isChildRole: false,
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
export const MEMBER = {
  id: "mem-1", accountId: "acc-1", userId: "user-1",
  name: "Testförälder", roleId: "role-1", isChild: false,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, deletedAt: null, deletedBy: null,
};
const USER = { id: "user-1", email: "test@exempel.se", name: "Testförälder", createdAt: "2024-01-01T00:00:00.000Z" };

export const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: MEMBER, account: ACCOUNT }],
};

// mockDataAPIs — mock:ar bara datanropen (inte auth/refresh).
// Används när testet hanterar auth separat.
export async function mockDataAPIs(page: Page) {
  // Säkerhetsnät mot HELA klassen av bugg som redan dokumenterats upprepade
  // gånger i den här filen (t.ex. kommentarerna på members/*, todos/events,
  // recipes ovan): ett API-anrop utan egen mock faller igenom till ett RIKTIGT
  // nätverksanrop. Lokalt (till skillnad från CI, där webServer alltid
  // startas fräscht och inget lyssnar på :3000) proxar `vite preview` detta
  // vidare (server.proxy i vite.config.ts) till en verklig backend på
  // localhost:3000 — och råkar en sådan redan vara igång av EN ANNAN process
  // på samma maskin (vanligt när flera Claude Code-sessioner kör parallellt),
  // svarar den med ett ÄKTA 401 (den mockade fake-access-token:en känns
  // förstås inte igen). client.ts:s performRequest/handleUnauthorized
  // behandlar VILKET 401-svar som helst som "hela sessionen är ogiltig" —
  // försöker en riktig refresh (misslyckas av samma skäl), och loggar sedan
  // ut HELA appen (onUnauthorized) — även om det ursprungliga anropet bara
  // gällde en liten, ovidkommande delfunktion (t.ex. GET /api/household-pin,
  // som konkret bekräftades vara den utlösande orsaken 2026-08-10 — testet
  // "flakade" bara beroende på om en riktig backend råkade lyssna på :3000
  // just då, inte på DOM-timing). Registrerad FÖRST (lägst prioritet, samma
  // "bred FÖRE specifik"-konvention som resten av filen) — alla senare,
  // mer specifika mockningar nedan fortsätter gälla för sina egna mönster,
  // det är bara det som INTE matchar något annat som hamnar här istället för
  // ute på nätverket. Undantar uttryckligen /api/auth/* — mockAuthAndData/
  // mockUnauthenticated/loginViaUI registrerar SINA egna auth-mockningar
  // både före och efter detta anrop beroende på ordning, route.fallback()
  // låter alltid DEN specifika (oavsett var i koden den råkar stå) vinna.
  await page.route("**/api/**", (route) => {
    if (route.request().url().includes("/api/auth/")) {
      return route.fallback();
    }
    return route.fulfill({ json: {} });
  });
  // GET /api/household-pin (2026-07-26) — hämtas globalt av
  // SettingsContent.tsx:s useHouseholdPin() så fort Inställningar-panelen
  // monteras, oavsett vilken kategori man faktiskt öppnar. Konkret
  // bekräftad utlösare till buggen som beskrivs ovan.
  await page.route("**/api/household-pin", (route) => route.fulfill({ json: { isSet: false } }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  // Matchar även /api/members/:id (t.ex. update/restore/remove) — utan denna
  // föll anrop som membersApi.update() (bl.a. lastActivePanel-persistering vid
  // panelbyte) igenom till en riktig, ej mockad backend och gav ett äkta 401
  // (ogiltig fake-access-token), vilket triggade "Sessionen kunde inte förnyas".
  await page.route("**/api/members/*", (route) => route.fulfill({ json: { ok: true } }));
  // Mina väntande barn-delningar (2026-07-29) — hämtas globalt av
  // PendingChildShares.tsx (renderas alltid, oavsett om kontot har egna
  // barn), MÅSTE registreras EFTER den bredare **/api/members/*-mockningen
  // ovan (Playwright kör senast registrerade matchning först) — annars
  // fångas den av den generiska {ok:true}-stubben (fel form, en array
  // förväntas), vilket kraschar renderingen tyst i en ErrorBoundary.
  await page.route("**/api/members/pending-child-shares", (route) => route.fulfill({ json: [] }));
  // Hem-vyns familjefilter (2026-07-31) — hämtas globalt av
  // MemberShellContent.tsx (var med i Home-sammanslagningen), samma
  // "MÅSTE registreras EFTER den bredare mockningen ovan"-skäl som
  // pending-child-shares.
  await page.route("**/api/members/cross-account", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/members/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  // Todo-historik/Papperskorg, paginerad (2026-07-26) — default-stubb så
  // ett test som råkar öppna den underkategorin utan egen mock inte faller
  // igenom till ett riktigt, ej mockat nätverksanrop.
  await page.route("**/api/todos/history**", (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  // SSE-strömmen för todo-ändringar — utan denna faller den igenom till en riktig
  // backend och 401:ar (ofarligt i sig, men brusigt och kan racea med riktiga tester).
  await page.route("**/api/todos/events", (route) => route.fulfill({ status: 204, body: "" }));
  // Delade barns todos/data (ADR-0024) — hämtas globalt av
  // useSharedChildrenTodos (AccountSettings.tsx/SharedChildrenThreads.tsx,
  // sedan 2026-08-01 renderad i Hem-vyns Todos-flik, inte längre Todos-
  // panelen), default-stubb så ett test utan egen mock inte faller igenom
  // till ett riktigt, ej mockat nätverksanrop.
  await page.route("**/api/todos/shared-children", (route) => route.fulfill({ json: [] }));
  // Delade EGNA kategorier (2026-08-06) — hämtas globalt av
  // useSharedCategoryTodos (SharedCategoryThreads.tsx, Hem-vyns Todos-flik),
  // samma default-stubb-skäl som shared-children ovan.
  await page.route("**/api/todos/shared-categories", (route) => route.fulfill({ json: [] }));
  // Familjeanslutningar (ADR-0030, 2026-07-29) — hämtas globalt av Hem-vyn
  // (MemberOverview.tsx/ConnectionRecipesSection, sedan 2026-08-01 — flyttat
  // ut ur Todos-/Recept-/Inköp-panelerna, som numera bara visar mitt eget),
  // default-stubbar så ett test utan egen mock inte faller igenom till ett
  // riktigt, ej mockat nätverksanrop.
  await page.route("**/api/todos/connections", (route) => route.fulfill({ json: [] }));
  // Mina familjekonton (2026-07-25) — hämtas globalt av MemberShellContent.tsx
  // (Hem-vyns familjefilter, 2026-07-31) varje gång Hem renderas. Sedan
  // 2026-08-01 bidrar detta även med Todos-panelens EGNA signade-tråd
  // (personalSignedUpThreadSources) — se samma dags rättelse i CLAUDE.md.
  await page.route("**/api/todos/family-across-accounts", (route) => route.fulfill({ json: [] }));
  // Receptlistan (2026-07-26) — useRecipesState() lyftes den dagen från en
  // lokal hook i RecipesView.tsx till en DELAD instans i useShellState.ts
  // (så Inställningar och receptvyn delar samma data) — sedan dess hämtas
  // GET /api/recipes GLOBALT av varje session, oavsett aktiv panel, precis
  // som todo-categories/timed-tasks/reward-shop. Många äldre testfiler
  // (skrivna innan denna lyft) mockar den aldrig explicit — utan en
  // bred default-stubb faller anropet igenom till ett riktigt, ej mockat
  // nätverksanrop (ECONNREFUSED i CI, ingen backend körs i E2E-jobbet),
  // vilket kan hänga/krascha HELA sidladdningen (2026-08-08, upptäckt via en
  // stabil, upprepad CI-röd-kluster som spårades till exakt detta).
  // Registrerad FÖRE de mer specifika /connections och /cross-account
  // nedan (samma "bred FÖRE specifik"-konvention som resten av filen).
  await page.route("**/api/recipes", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/recipes/connections", (route) => route.fulfill({ json: [] }));
  // Mina familjekonton (2026-08-01) — recept/inköpslistor/måltidsplan i ett
  // av mina egna andra medlemskap, hämtas globalt av Hem-vyn/måltids-
  // planeringen, samma skäl som family-across-accounts/connections ovan.
  await page.route("**/api/recipes/cross-account", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping/cross-account", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/meal-plan/cross-account**", (route) => route.fulfill({ json: [] }));
  // Vuxenvyns personliga kategori-trådar (2026-07-05) — hämtas globalt av
  // useShellState oavsett aktiv panel, precis som timed-tasks/reward-shop.
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  // Mallbibliotek (2026-07-08) — hämtas globalt av useShellState, samma
  // mönster som todo-categories ovan.
  await page.route("**/api/todo-templates/tasks", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todo-templates/categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  // Familjeanslutningar (ADR-0030) — registrerad EFTER **/api/shopping**
  // ovan (Playwright kör senast registrerade matchning först), annars vinner
  // aldrig den bredare stubben ändå eftersom bägge returnerar en tom lista —
  // men följer samma "specifik EFTER bred"-konvention som resten av filen.
  await page.route("**/api/shopping/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/reward-shop**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/timed-tasks**", (route) => route.fulfill({ json: [] }));
}

// mockAuthAndData — simulerar en redan inloggad användare vid sidladdning.
// refresh returnerar giltig session → inloggningsformuläret visas aldrig.
export async function mockAuthAndData(page: Page) {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ json: LOGIN_RESPONSE })
  );
  await mockDataAPIs(page);
}

// mockUnauthenticated — refresh returnerar 401 → inloggningsformuläret visas.
export async function mockUnauthenticated(page: Page) {
  await page.route("**/api/auth/refresh", (route) =>
    route.fulfill({ status: 401, json: { error: "Ej autentiserad" } })
  );
}

// loginViaUI — fyll i och skicka inloggningsformuläret med mock:at API-svar.
// Kräver att mockUnauthenticated + mockDataAPIs redan är satta upp.
export async function loginViaUI(page: Page) {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: LOGIN_RESPONSE })
  );
  await page.getByLabel("E-postadress").fill("test@exempel.se");
  await page.getByLabel("Lösenord").fill("lösenord123");
  await page.getByRole("button", { name: "Logga in", exact: true }).click();
}
