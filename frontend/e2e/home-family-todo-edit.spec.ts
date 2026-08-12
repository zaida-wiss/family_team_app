/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// 2026-08-06, Zaidas fynd: "när jag ska redigera familjens todo så står det
// andra kategorier än de som finns i familjen" — TodoEditModal (öppnad från
// pennikonen i TodoDetailView) filtrerade sin kategori-dropdown ALLTID på
// `!isFamily`, oavsett om modalen öppnats från den personliga Todos-panelen
// eller från Hem-vyns familjetrådar (sedan 2026-08-04) — visade alltså
// Zaidas egna PERSONLIGA kategorier istället för familjens, när man
// redigerar en familjeuppgift.

const FAMILY_CATEGORY = {
  id: "cat-family-rutiner", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
  isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
};
const PERSONAL_CATEGORY = {
  id: "cat-personal-skola", accountId: "acc-1", memberId: "mem-1", name: "Skola",
  isFamily: false, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
};
const FAMILY_TODO = {
  id: "todo-kvall", accountId: "acc-1", title: "Kvällsrutiner", createdBy: "mem-1",
  assignedTo: null, isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: "cat-family-rutiner", notes: null
};

test("Hem-vyns familjetrådar: redigera-modalens kategori-dropdown visar familjekategorier, inte mina personliga", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [FAMILY_CATEGORY, PERSONAL_CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [FAMILY_TODO] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await page.getByRole("button", { name: /^Kvällsrutiner,/ }).click();
  await page.getByRole("button", { name: "Redigera uppgift" }).click();

  const categorySelect = page.getByLabel(/^Kategori/);
  await expect(categorySelect.getByRole("option", { name: "Rutiner" })).toBeAttached();
  await expect(categorySelect.getByRole("option", { name: "Skola" })).not.toBeAttached();
});

// 2026-08-07, Zaidas fynd: "jag verkar inte kunna byta kategori i modalen"
// — seriesPatch.personalCategoryId var ovillkorligt `null` så fort
// mottagaren var "Familjen" (isFamilyRecipient), vilket är det NORMALA
// tillståndet för nästan varje familjekategori-uppgift (assignedTo:null +
// en satt personalCategoryId, t.ex. FAMILY_TODO ovan) — kategorivalet i
// dropdownen sparades alltså aldrig i familje-scope, oavsett vad man valde.
test("Hem-vyns familjetrådar: byte av kategori i redigera-modalen sparas faktiskt (inte tyst nollställt till Ingen kategori)", async ({ page }) => {
  const FORDON_CATEGORY = {
    id: "cat-family-fordon", accountId: "acc-1", memberId: "mem-1", name: "Fordon & Underhåll",
    isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
  };
  // Kategori-dropdownen filtrerar bort TOMMA familjekategorier (TodoEditModal.
  // tsx, samma princip som tråd-vyns "tomma kategorier göms") — en kategori
  // utan någon "pending"-uppgift visas alltså inte i listan alls, om den inte
  // redan är vald. En egen, orelaterad uppgift i Fordon & Underhåll krävs för
  // att kunna VÄLJA den kategorin i det här testet.
  const OTHER_FORDON_TODO = {
    ...FAMILY_TODO, id: "todo-fordon-other", title: "Byt vinterdäck", personalCategoryId: "cat-family-fordon"
  };
  let patchedBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [FAMILY_CATEGORY, FORDON_CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [FAMILY_TODO, OTHER_FORDON_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-kvall", (route) => {
    if (route.request().method() === "PATCH") {
      patchedBody = { ...patchedBody, ...(route.request().postDataJSON() as object) };
    }
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await page.getByRole("button", { name: /^Kvällsrutiner,/ }).click();
  await page.getByRole("button", { name: "Redigera uppgift" }).click();
  await page.getByLabel(/^Kategori/).selectOption({ label: "Fordon & Underhåll" });

  await expect.poll(() => patchedBody?.personalCategoryId).toBe("cat-family-fordon");
});

// 2026-08-06, Zaidas fynd: "det är även fortfarande problem med
// autentisering och behörighet att radera todos" — TodoEditModal.tsx:s
// handleDelete stängde modalen OVILLKORLIGT direkt efter att onDeleteTodo
// anropats, utan att någonsin läsa av resultatet — en nekad radering
// (softDeleteTodo's klientsidiga canDeleteTodo-förkoll, useTodosState.ts)
// gav alltså varken felmeddelande eller kvarhållen modal, bara "ingenting
// händer". Ingen DELETE-request ska ens skickas (blockeras redan
// klientsidan) och ett tydligt fel ska visas istället.
test("Hem-vyns familjetrådar: en nekad radering (ingen behörighet) visar ett tydligt fel istället för att bara stänga modalen tyst", async ({ page }) => {
  const RESTRICTED_ROLE = {
    id: "role-1", name: "Utan raderingsbehörighet", isChildRole: false,
    permissions: {
      canManageMembers: true, canManageRoles: true, canSeeAllTodos: true, canSeeOwnTodos: true,
      canCreateTodos: true, canScheduleRecurringTodos: true, canCompleteAssignedTodos: true,
      canEditAnyTodos: false, canDeleteAnyTodos: false, canApproveTodos: true, canSeeAllCalendar: true,
      canSeeOwnCalendar: true, canCreateCalendar: true, canEditCalendar: true, canImportCalendar: true,
      canExportCalendar: true, canSeeShoppingLists: true, canCreateShoppingLists: true,
      canEditShoppingLists: true, canViewTrash: true, canRestoreFromTrash: true,
      canCreateChildAccounts: true, canManageChildTodos: true
    }
  };
  const NOT_MY_TODO = {
    id: "todo-not-mine", accountId: "acc-1", title: "Skapad av någon annan", createdBy: "mem-annan",
    assignedTo: null, isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let deleteCalled = false;

  await mockAuthAndData(page);
  await page.route("**/api/roles", (route) => route.fulfill({ json: [RESTRICTED_ROLE] }));
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [NOT_MY_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-not-mine", (route) => {
    if (route.request().method() === "DELETE") deleteCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await page.getByRole("button", { name: /^Skapad av någon annan,/ }).click();
  await page.getByRole("button", { name: "Redigera uppgift" }).click();
  await page.getByRole("button", { name: "Radera" }).click();

  await expect(page.getByText(/Kunde inte radera/)).toBeVisible();
  expect(deleteCalled).toBe(false);
  // Modalen ska INTE ha stängts — redigeringsfältet är fortfarande synligt.
  await expect(page.getByLabel(/^Kategori/)).toBeVisible();
});

// 2026-08-07, Zaidas fynd: "när jag ska uppdatera todon till kategori
// Fordon & underhåll och ändra emoji så fungerar det inte" — för en
// ÅTERKOMMANDE uppgift (mall + dagens occurrence) sparas kategori/emoji-
// ändringen på MALLEN korrekt, men refreshRoutineOccurrence (kallas direkt
// efter, samma synkrona anrop) läste template-fälten från en ÄNNU EJ
// synkad todosRef.current och kopierade tyst tillbaka de GAMLA värdena på
// dagens occurrence — både lokalt och till servern. Verifierar att BÅDA
// PATCH-anropen (mall och occurrence) bär den NYA kategorin/emojin.
test("Hem-vyns familjetrådar: kategori- och emoji-byte på en ÅTERKOMMANDE uppgift sparas korrekt på både mall och dagens occurrence", async ({ page }) => {
  const RUTINER_CATEGORY = {
    id: "cat-family-rutiner", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
    isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
  };
  const FORDON_CATEGORY = {
    id: "cat-family-fordon", accountId: "acc-1", memberId: "mem-1", name: "Fordon & Underhåll",
    isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
  };
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const TEMPLATE = {
    id: "todo-template", accountId: "acc-1", title: "Städa bilen", createdBy: "mem-1",
    assignedTo: null, isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "🚗" },
    recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    // visibleFrom är ankardatumet för en återkommande mall — appen kräver ett
    // riktigt startdatum (canSubmit/isStartDateMissing i TodoEditModal.tsx),
    // en null-mall gör autospara helt tyst overksam (2026-08-08, CI-fynd).
    rejectedReason: null, visibleFrom: "2026-01-01T00:00:00.000Z", expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: "cat-family-rutiner", notes: null
  };
  const OCCURRENCE = {
    ...TEMPLATE,
    id: "todo-occurrence", recurringSourceId: "todo-template", occurrenceDate: todayKey,
    recurrence: { type: "none" }
  };
  // Kategori-dropdownen filtrerar bort TOMMA familjekategorier (samma
  // princip som tråd-vyns "tomma kategorier göms") — en egen, orelaterad
  // uppgift i Fordon & Underhåll krävs för att kunna VÄLJA den här.
  const OTHER_FORDON_TODO = {
    ...TEMPLATE, id: "todo-fordon-other", title: "Byt vinterdäck",
    personalCategoryId: "cat-family-fordon", recurrence: { type: "none" }
  };
  let templatePatch: Record<string, unknown> | null = null;
  let occurrencePatch: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [RUTINER_CATEGORY, FORDON_CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TEMPLATE, OCCURRENCE, OTHER_FORDON_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-template", (route) => {
    if (route.request().method() === "PATCH") {
      templatePatch = { ...templatePatch, ...(route.request().postDataJSON() as object) };
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todos/todo-occurrence", (route) => {
    if (route.request().method() === "PATCH") {
      occurrencePatch = { ...occurrencePatch, ...(route.request().postDataJSON() as object) };
    }
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  await page.getByRole("button", { name: /^Städa bilen,/ }).click();
  await page.getByRole("button", { name: "Redigera uppgift" }).click();
  await page.getByLabel(/^Kategori/).selectOption({ label: "Fordon & Underhåll" });
  await page.locator(".todo-emoji-btn").click();
  await page.getByPlaceholder("Sök på svenska...").fill("tandborste");
  await page.locator('button[title="Tandborste"]').click();

  // Två separata poll:ar, INTE poll+synkront expect (2026-08-12, CI-fynd:
  // kategori och emoji väljs som två separata UI-interaktioner — pausar man
  // mellan dem (realistiskt för en riktig användare, och så gott som
  // GARANTERAT under CPU-belastning i CI) hinner den 700ms debouncen i
  // TodoEditModal.tsx spara kategorin FÖR SIG innan emojin ens är vald, en
  // helt avsedd, korrekt två-stegssparning — inte en bugg i appen. Ett
  // synkront expect direkt efter kategori-pollningen läste då den ÄNNU
  // opparade mellansparningen (rätt kategori, gammal emoji) istället för att
  // vänta in den andra, fullständiga sparningen. Ett eget poll på visual-
  // fältet väntar in den, precis som poll:en på personalCategoryId redan gör.
  await expect.poll(() => templatePatch?.personalCategoryId).toBe("cat-family-fordon");
  await expect.poll(() => (templatePatch?.visual as { value: string } | undefined)?.value).toBe("🪥");

  // Kärnregressionen: occurrence-patchen (från refreshRoutineOccurrence) ska
  // bära samma NYA värden, inte de gamla ("cat-family-rutiner"/"🚗").
  await expect.poll(() => occurrencePatch?.personalCategoryId).toBe("cat-family-fordon");
  await expect.poll(() => (occurrencePatch?.visual as { value: string } | undefined)?.value).toBe("🪥");
});

// 2026-08-07, Zaidas fynd EFTER ovanstående test redan var grönt: "nu går
// det att uppdatera både emoji och kategori, men de ligger ändå kvar under
// dessa kategorier. De går inte att flytta" — den bubbla man faktiskt tittar
// på och redigerar är INTE alltid dagens occurrence (en fortfarande obesvarad
// bubbla genererad en tidigare dag har ett äldre occurrenceDate, syns ändå om
// den inte hunnit gå ut). refreshRoutineOccurrence synkar bara DAGENS
// occurrence — utan att seriesPatch även appliceras direkt på `todo.id`
// självt förblev en sådan äldre bubbla kvar i sin gamla kategori trots en
// till synes lyckad sparning (mallen uppdaterades korrekt, bara inte den
// synliga posten).
test("Hem-vyns familjetrådar: kategori- och emoji-byte på en ÄLDRE, ännu obesvarad occurrence (inte dagens) flyttar bubblan direkt", async ({ page }) => {
  const RUTINER_CATEGORY = {
    id: "cat-family-rutiner", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
    isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
  };
  const FORDON_CATEGORY = {
    id: "cat-family-fordon", accountId: "acc-1", memberId: "mem-1", name: "Fordon & Underhåll",
    isFamily: true, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z"
  };
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  // "unit:week" med alla veckodagar UTOM dagens (2026-08-08, CI-fynd) —
  // en daglig mall (unit:"day") genererar automatiskt sin EGEN dagens-
  // occurrence (klientsidig syncScheduledTodos), oberoende av OLD_OCCURRENCE
  // nedan — testet fick då TVÅ bubblor med samma titel/emoji, en Playwright
  // strict-mode-krock. Mallen behöver fortfarande vara "recurring" (testets
  // syfte är just en återkommande uppgift), bara inte träffa just IDAG.
  const WEEKDAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayWeekday = WEEKDAY_ORDER[new Date().getDay()];
  const otherWeekdays = WEEKDAY_ORDER.filter((d) => d !== todayWeekday);
  const TEMPLATE = {
    id: "todo-template", accountId: "acc-1", title: "Städa bilen", createdBy: "mem-1",
    assignedTo: null, isShared: false, status: "pending", starValue: 0,
    visual: { type: "lucide-icon", value: "🚗" },
    recurrence: { type: "recurring", unit: "week", every: 1, daysOfWeek: otherWeekdays },
    recurringSourceId: null, occurrenceDate: null, completedAt: null,
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    // visibleFrom är ankardatumet för en återkommande mall — appen kräver ett
    // riktigt startdatum (canSubmit/isStartDateMissing i TodoEditModal.tsx),
    // en null-mall gör autospara helt tyst overksam (2026-08-08, CI-fynd).
    rejectedReason: null, visibleFrom: "2026-01-01T00:00:00.000Z", expiresAt: null, deletedAt: null, deletedBy: null,
    personalCategoryId: "cat-family-rutiner", notes: null
  };
  // Genererad IGÅR, fortfarande "pending" (aldrig avklarad/utgången) — inte
  // samma post som dagens occurrence, som inte ens existerar än i denna fixtur.
  const OLD_OCCURRENCE = {
    ...TEMPLATE,
    id: "todo-old-occurrence", recurringSourceId: "todo-template", occurrenceDate: yesterdayKey,
    recurrence: { type: "none" }
  };
  // Kategori-dropdownen filtrerar bort TOMMA familjekategorier — en egen,
  // orelaterad uppgift i Fordon & Underhåll krävs för att kunna VÄLJA den.
  const OTHER_FORDON_TODO = {
    ...TEMPLATE, id: "todo-fordon-other", title: "Byt vinterdäck",
    personalCategoryId: "cat-family-fordon", recurrence: { type: "none" }
  };
  let oldOccurrencePatch: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [RUTINER_CATEGORY, FORDON_CATEGORY] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TEMPLATE, OLD_OCCURRENCE, OTHER_FORDON_TODO] });
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-template", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/todos/todo-old-occurrence", (route) => {
    if (route.request().method() === "PATCH") {
      oldOccurrencePatch = { ...oldOccurrencePatch, ...(route.request().postDataJSON() as object) };
    }
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Visa todos" }).click();

  // Bubblan syns i Rutiner-tråden innan redigering.
  const rutinerThread = page.locator(".todo-thread", { hasText: "Rutiner" });
  await expect(rutinerThread.getByRole("button", { name: /^Städa bilen,/ })).toBeVisible();

  await page.getByRole("button", { name: /^Städa bilen,/ }).click();
  await page.getByRole("button", { name: "Redigera uppgift" }).click();
  await page.getByLabel(/^Kategori/).selectOption({ label: "Fordon & Underhåll" });
  await page.locator(".todo-emoji-btn").click();
  await page.getByPlaceholder("Sök på svenska...").fill("tandborste");
  await page.locator('button[title="Tandborste"]').click();

  // Kärnregressionen: DEN ÖPPNADE, äldre occurrencen själv ska få de nya
  // värdena — inte bara mallen (som ovanstående test redan täcker).
  // Två separata poll:ar, se kommentaren i föregående test — kategori och
  // emoji sparas i två avsedda steg under CPU-belastning, ett synkront
  // expect direkt efter kategori-pollningen hinner då läsa mellansparningen.
  await expect.poll(() => oldOccurrencePatch?.personalCategoryId).toBe("cat-family-fordon");
  await expect.poll(() => (oldOccurrencePatch?.visual as { value: string } | undefined)?.value).toBe("🪥");

  await page.getByRole("button", { name: "Stäng" }).click();
  // Bubblan har flyttat sig till den nya kategorins tråd i UI:t.
  const fordonThread = page.locator(".todo-thread", { hasText: "Fordon & Underhåll" });
  await expect(fordonThread.getByRole("button", { name: /^Städa bilen,/ })).toBeVisible();
  await expect(rutinerThread.getByRole("button", { name: /^Städa bilen,/ })).toHaveCount(0);
});
