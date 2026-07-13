import { test, expect, type Page } from "@playwright/test";

// Sprint 4 S3: barnets Rekord-vy — start/stopp-tryck (inte håll-in, se S9-spiken),
// live tidräknare medan igång, personbästa uppdateras efter stopp.

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
  approvedStars: 0, spentStars: 0, deletedAt: null, deletedBy: null,
};

const USER = { id: "user-child", email: "nova@exempel.se", name: "Nova", createdAt: "2024-01-01T00:00:00.000Z" };

const LOGIN_RESPONSE = {
  accessToken: "fake-access-token",
  user: USER,
  memberships: [{ member: CHILD, account: ACCOUNT }],
};

const TIMED_TASK = {
  id: "tt-1",
  accountId: "acc-1",
  title: "Springa ett varv",
  symbol: "🏃",
  assignedTo: "mem-child",
  createdBy: "mem-parent",
  deletedAt: null,
  deletedBy: null,
  bestDurationMs: null,
  bestAchievedAt: null,
  attemptCount: 0,
};

const TIMED_TASK_2 = {
  ...TIMED_TASK,
  id: "tt-2",
  title: "Hoppa rep",
  symbol: "🤸",
};

async function mockChildSession(page: Page) {
  await page.route("**/api/auth/refresh", (route) => route.fulfill({ json: LOGIN_RESPONSE }));
  await page.route("**/api/members", (route) => route.fulfill({ json: [CHILD] }));
  await page.route("**/api/roles", (route) => route.fulfill({ json: [CHILD_ROLE] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/shopping**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/rewards**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop$/, (route) =>
    route.fulfill({ json: { items: [], requireApprovalForCategories: false } })
  );
  await page.route(/\/api\/reward-shop\/purchased\?date=/, (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/reward-shop\/purchased\?page=/, (route) =>
    route.fulfill({ json: { items: [], page: 1, pageSize: 25, total: 0 } })
  );
  await page.route("**/api/analytics/**", (route) => route.fulfill({ json: { ok: true } }));
}

// Rekord flyttades 2026-07-06 (Zaidas beslut) från en alltid synlig sektion
// längst ner i dashboarden till en egen sida — en pokal-knapp till vänster om
// profilbilden öppnar den, en tillbaka-pil (vänsterpekande) stänger den igen.
test("Barnets Rekord-vy: pokal-knappen öppnar en egen sida, tillbaka-pilen stänger den", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [TIMED_TASK] }));

  await page.goto("/");
  await expect(page.getByText("Springa ett varv")).toHaveCount(0);

  await page.getByRole("button", { name: "Rekord" }).click();
  await expect(page.getByRole("heading", { name: "🏆 Rekord" })).toBeVisible();
  await expect(page.getByText("Springa ett varv")).toBeVisible();

  await page.getByRole("button", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "🏆 Rekord" })).toHaveCount(0);
  await expect(page.getByText("Springa ett varv")).toHaveCount(0);
});

test("Barnets Rekord-vy: start/stopp spelar in ett försök", async ({ page }) => {
  let recordedDurationMs: number | null = null;
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [TIMED_TASK] }));
  await page.route("**/api/timed-tasks/tt-1/attempts", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { durationMs: number };
    recordedDurationMs = body.durationMs;
    return route.fulfill({
      status: 201,
      json: { id: "ta-1", durationMs: body.durationMs, achievedAt: new Date().toISOString(), isNewRecord: true },
    });
  });

  await page.goto("/");
  // Rekord flyttades 2026-07-06 (Zaidas beslut) till en egen sida, nås via
  // pokal-knappen till vänster om profilbilden — inte längre alltid synlig.
  await page.getByRole("button", { name: "Rekord" }).click();
  await expect(page.getByText("Springa ett varv")).toBeVisible();
  await expect(page.getByText("Inget rekord än")).toBeVisible();

  await page.getByRole("button", { name: "Starta tidtagning för Springa ett varv" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stoppa tidtagning för Springa ett varv" }).click();

  await expect.poll(() => recordedDurationMs).not.toBeNull();
  expect(recordedDurationMs).toBeGreaterThan(500);
  expect(recordedDurationMs).toBeLessThan(5000);
});

test("Barnets Rekord-vy: begär skärm-wake-lock medan tidtagning pågår, släpper vid stopp", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TIMED_TASK] });
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        json: { id: "ta-1", durationMs: 1000, achievedAt: new Date().toISOString(), isNewRecord: true },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.addInitScript(() => {
    (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls = [];
    // navigator.wakeLock är en getter-only-egenskap i riktiga webbläsare — en
    // vanlig tilldelning no-opar tyst. Object.defineProperty krävs för att
    // faktiskt ersätta den med en spionerbar stubb.
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: async (type: string) => {
          (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls.push(`request:${type}`);
          return {
            released: false,
            release: async () => {
              (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls.push("release");
            },
          };
        },
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Rekord" }).click();
  await page.getByRole("button", { name: "Starta tidtagning för Springa ett varv" }).click();

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls)
  ).toEqual(["request:screen"]);

  await page.getByRole("button", { name: "Stoppa tidtagning för Springa ett varv" }).click();

  await expect.poll(() =>
    page.evaluate(() => (window as unknown as { __wakeLockCalls: string[] }).__wakeLockCalls)
  ).toContain("release");
});

test("Barnets Rekord-vy: skickar timed-task-started/completed till analytics", async ({ page }) => {
  const trackedEvents: string[] = [];
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [TIMED_TASK] }));
  await page.route("**/api/timed-tasks/tt-1/attempts", (route) =>
    route.fulfill({
      status: 201,
      json: { id: "ta-1", durationMs: 1000, achievedAt: new Date().toISOString(), isNewRecord: false },
    })
  );
  await page.route("**/api/analytics/track", (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { event: string };
    trackedEvents.push(body.event);
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Rekord" }).click();
  await page.getByRole("button", { name: "Starta tidtagning för Springa ett varv" }).click();
  await expect.poll(() => trackedEvents).toContain("timed-task-started");

  await page.getByRole("button", { name: "Stoppa tidtagning för Springa ett varv" }).click();
  await expect.poll(() => trackedEvents).toContain("timed-task-completed");
});

test("Barnets Rekord-vy: medalj visas vid nytt rekord och avslöjar detaljer", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [{
          ...TIMED_TASK,
          bestDurationMs: 12000,
          bestAchievedAt: "2026-06-01T10:00:00.000Z",
          attemptCount: 4,
        }],
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Rekord" }).click();
  const medalBtn = page.getByRole("button", { name: "Visa rekorddetaljer för Springa ett varv" });
  await expect(medalBtn).toBeVisible();

  await medalBtn.click();
  await expect(page.getByText("Antal försök: 4")).toBeVisible();
  await expect(page.getByText(/Tid: 0:12/)).toBeVisible();
});

// 2026-07-13, Zaidas önskemål: en redigera-ruta (penna) ska öppna en modal
// med datum/antal försök per dag, och man ska kunna ta bort tider.
test("Barnets Rekord-vy: pennan öppnar en redigera-modal med försök grupperade per dag", async ({ page }) => {
  await mockChildSession(page);
  const attempts = [
    { id: "ta-1", timedTaskId: "tt-1", memberId: "mem-child", durationMs: 40000, achievedAt: "2026-07-10T09:00:00.000Z", isNewRecord: true, deletedAt: null, deletedBy: null },
    { id: "ta-2", timedTaskId: "tt-1", memberId: "mem-child", durationMs: 50000, achievedAt: "2026-07-10T18:00:00.000Z", isNewRecord: false, deletedAt: null, deletedBy: null },
    { id: "ta-3", timedTaskId: "tt-1", memberId: "mem-child", durationMs: 45000, achievedAt: "2026-07-11T09:00:00.000Z", isNewRecord: false, deletedAt: null, deletedBy: null },
  ];
  await page.route("**/api/timed-tasks", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [{ ...TIMED_TASK, bestDurationMs: 40000, bestAchievedAt: "2026-07-10T09:00:00.000Z", attemptCount: 3 }],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/timed-tasks/tt-1/attempts", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: attempts });
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Rekord" }).click();
  await page.getByRole("button", { name: "Redigera tider för Springa ett varv" }).click();

  const modal = page.getByRole("dialog", { name: "Springa ett varv" });
  await expect(modal.getByText("(2 försök)")).toBeVisible();
  await expect(modal.getByText("(1 försök)")).toBeVisible();
  // .timed-task-records-modal__duration (inte modal.getByText) — undviker
  // träffar på diagrammets egna axel-/slutpunkts-etiketter, som visar samma
  // varaktighetstext.
  const durations = modal.locator(".timed-task-records-modal__duration");
  await expect(durations.filter({ hasText: "0:40" })).toBeVisible();
  await expect(durations.filter({ hasText: "0:50" })).toBeVisible();
  await expect(durations.filter({ hasText: "0:45" })).toBeVisible();
});

test("Barnets Rekord-vy: tar bort en tid i redigera-modalen", async ({ page }) => {
  await mockChildSession(page);
  let attempts = [
    { id: "ta-1", timedTaskId: "tt-1", memberId: "mem-child", durationMs: 40000, achievedAt: "2026-07-10T09:00:00.000Z", isNewRecord: true, deletedAt: null, deletedBy: null },
    { id: "ta-2", timedTaskId: "tt-1", memberId: "mem-child", durationMs: 50000, achievedAt: "2026-07-10T18:00:00.000Z", isNewRecord: false, deletedAt: null, deletedBy: null },
  ];
  await page.route("**/api/timed-tasks", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [{ ...TIMED_TASK, bestDurationMs: 40000, bestAchievedAt: "2026-07-10T09:00:00.000Z", attemptCount: 2 }],
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/timed-tasks/tt-1/attempts/ta-2", (route) => {
    attempts = attempts.filter((a) => a.id !== "ta-2");
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/timed-tasks/tt-1/attempts", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: attempts });
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Rekord" }).click();
  await page.getByRole("button", { name: "Redigera tider för Springa ett varv" }).click();

  const modal = page.getByRole("dialog", { name: "Springa ett varv" });
  const durations = modal.locator(".timed-task-records-modal__duration");
  await expect(durations.filter({ hasText: "0:50" })).toBeVisible();
  await modal.getByRole("button", { name: /Ta bort försöket klockan/ }).nth(1).click();
  await expect(durations.filter({ hasText: "0:50" })).toHaveCount(0);
  await expect(durations.filter({ hasText: "0:40" })).toBeVisible();
});

// 2026-07-13, Zaidas fynd: "jag behöver kunna starta flera tidtagningar
// samtidigt utan att den föregående stoppas" — running var tidigare en enda
// {id, startedAt}-variabel, så att starta ett andra kort tystade det första.
test("Barnets Rekord-vy: kan starta flera tidtagningar samtidigt utan att den föregående stoppas", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [TIMED_TASK, TIMED_TASK_2] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Rekord" }).click();

  await page.getByRole("button", { name: "Starta tidtagning för Springa ett varv" }).click();
  await page.getByRole("button", { name: "Starta tidtagning för Hoppa rep" }).click();

  await expect(page.getByRole("button", { name: "Stoppa tidtagning för Springa ett varv" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stoppa tidtagning för Hoppa rep" })).toBeVisible();
});

// 2026-07-13, Zaidas fynd: "som användare skall jag även kunna refrescha
// eller växla vyer utan att tidtagningen stoppas" — running låg tidigare bara
// i lokal useState, som nollställdes så fort ChildRecordsPage monterades ner
// (växling till Dashboard och tillbaka igen).
test("Barnets Rekord-vy: en pågående tidtagning överlever att man växlar bort och tillbaka till sidan", async ({ page }) => {
  await mockChildSession(page);
  await page.route("**/api/timed-tasks", (route) => route.fulfill({ json: [TIMED_TASK] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Rekord" }).click();
  await page.getByRole("button", { name: "Starta tidtagning för Springa ett varv" }).click();

  await page.getByRole("button", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "🏆 Rekord" })).toHaveCount(0);

  await page.getByRole("button", { name: "Rekord" }).click();
  await expect(page.getByRole("button", { name: "Stoppa tidtagning för Springa ett varv" })).toBeVisible();
});
