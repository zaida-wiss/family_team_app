import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// 2026-07-31, Zaidas önskemål: "i min egen todo vy skall endast mina egna
// todos finnas, eller todos som jag signat upp mig på från familjevyn (hus
// ikonen)... Mina privata todos som jag inte delar med någon annan än mig
// själv skall inte visas i familjevyns todo." — Hem-vyns Todos-flik visar nu
// familje-/vuxen-todos.
//
// 2026-08-01, Zaidas rättelse: "hemvyn skall vara återanvändbara moduler med
// samma logik som i navbarens vyer... man skall signa upp sig på en
// uppgift på samma sätt som i todovyn med bollar i trådar" — den ursprungliga
// "Ta uppgiften"-knappen (satte assignedTo) ersatt av samma dubbeltryck-"vem
// håller på med den här"-gest (inProgressBy) som Todos-panelen redan har,
// se FamilyTodoThreads.tsx. Vidare rättelse SAMMA DAG: "det skall inte stå
// 'mina uppgifter'... det skall stå familjens namn... som kategori i min
// todovy" — en signad Familjen-todo syns i Todos-panelen i en EGEN tråd
// namngiven efter familjen (personalSignedUpThreadSources,
// MemberShellContent.tsx), inte i "Mina uppgifter".

const CATEGORY = {
  id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Träning",
  createdAt: "2024-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null
};

const FAMILY_TODO = {
  id: "todo-family", accountId: "acc-1", title: "Handla mat", createdBy: "mem-1",
  assignedTo: null, isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null, inProgressBy: [], inProgressSince: null
};

const PRIVATE_TODO = {
  ...FAMILY_TODO, id: "todo-private", title: "Hemlig grej", assignedTo: "mem-1", personalCategoryId: "cat-1"
};

test("Hem-vyns Todos-flik: signar upp sig på en Familjen-todo via dubbeltryck, syns då i Todos-panelen; privata todos syns aldrig i Hem", async ({ page }) => {
  let patchedInProgress: Record<string, unknown> | null = null;
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? [FAMILY_TODO, PRIVATE_TODO] : {} })
  );
  await page.route(`**/api/todos/${FAMILY_TODO.id}/in-progress`, (route) => {
    patchedInProgress = route.request().postDataJSON() as Record<string, unknown>;
    FAMILY_TODO.inProgressBy = [patchedInProgress.targetMemberId as string];
    return route.fulfill({ json: { inProgressBy: FAMILY_TODO.inProgressBy, inProgressSince: new Date().toISOString() } });
  });

  await page.goto("/");
  // Todos ligger bakom en flik i Hem (2026-07-31) — inte synligt förrän man
  // klickar ikonen bredvid familjeväljaren.
  await page.getByRole("button", { name: "Visa todos" }).click();

  // Hem: Familjen-todon syns som en boll, den privata gör det inte.
  const homeTodosCard = page.locator("article.dashboard").filter({ hasText: "Uppgifter" });
  await expect(homeTodosCard.getByText("Handla mat")).toBeVisible();
  await expect(homeTodosCard.getByText("Hemlig grej")).toHaveCount(0);

  // Dubbeltryck öppnar "vem håller på med den här" — samma gest som
  // Todos-panelen redan har (se FamilyTodoThreads.tsx/ParentTodoThreadView.tsx).
  await homeTodosCard.locator(".todo-thread__ball--home").dblclick();
  await page.getByRole("menu").getByRole("button", { name: MEMBER.name }).click();
  await expect.poll(() => patchedInProgress?.targetMemberId).toBe(MEMBER.id);

  // Todos-panelen: en egen tråd namngiven efter familjen ("Familjen Test")
  // innehåller den signerade Familjen-todon, aldrig en osignerad. exact:true
  // — Hem-vyns egen "Visa todos"-flikknapp innehåller annars "Todos" som
  // substräng.
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  const familyThread = page.getByRole("region", { name: "Tråd: Familjen Test" });
  await expect(familyThread).toBeVisible();
  await expect(familyThread.getByRole("button", { name: /Handla mat/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Hemlig grej/ })).toBeVisible();
});

// 2026-08-04, Zaidas fynd: "bubblorna i familjens todo-vy är mycket mindre
// i min egen todovy" — FamilyTodoThreads.tsx satte ovillkorligt klassen
// todo-thread__ball--small (Barn-trådens halva storlek i den personliga
// Todos-panelen) på ALLA sina bubblor, trots att den här komponenten aldrig
// visar barn-tilldelade uppgifter (getFamilyViewTodos utesluter dem helt).
// Uppmätt: 128×128px i den personliga vyn, bara 60×60px i Hem innan fixen.
test("Hem-vyns familjebubblor är samma storlek som Todos-panelens egna, inte den mindre Barn-storleken", async ({ page }) => {
  const FAMILY_CATEGORY = {
    id: "cat-fam", accountId: "acc-1", memberId: "mem-1", name: "Rutiner",
    isFamily: true, hidden: false, createdAt: "2024-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null
  };
  const PERSONAL_TODO = { ...FAMILY_TODO, id: "todo-personal", title: "Personlig uppgift", assignedTo: "mem-1" };
  const FAMILY_CATEGORY_TODO = { ...FAMILY_TODO, id: "todo-family-cat", title: "Familje-uppgift", personalCategoryId: "cat-fam" };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [FAMILY_CATEGORY] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? [PERSONAL_TODO, FAMILY_CATEGORY_TODO] : {} })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  const personalBox = await page.locator(".todo-thread__ball").first().boundingBox();

  await page.getByRole("button", { name: "Hem", exact: true }).click();
  await page.getByRole("button", { name: "Visa todos" }).click();
  const familyBox = await page.locator(".todo-thread__ball").first().boundingBox();

  expect(familyBox?.width).toBe(personalBox?.width);
  expect(familyBox?.height).toBe(personalBox?.height);
});

// 2026-08-04, Zaidas fynd: "kvällsrutiner syns fortfarande" — Hem-vyns
// familjetrådar (FamilyTodoThreads.tsx) visade tidigare en "idag"-uppgift
// hela dagen oavsett exakt klockslag (dag-baserad isDueWithinRange). Nu
// krävs att NU faktiskt ligger mellan visibleFrom/expiresAt (isTodoVisibleNow),
// och nowTick tickar KONTINUERLIGT (inte bara när en delad "någon håller på
// med"-klocka behövs, en bugg i den första versionen av fixen) så uppgiften
// dyker upp automatiskt i realtid utan omladdning.
test("Hem-vyns familjetodo: en kvällsuppgift döljs innan sitt klockslag, dyker upp automatiskt i realtid utan omladdning", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-08-04T14:00:00") });

  const EVENING_TODO = {
    ...FAMILY_TODO,
    id: "todo-evening",
    title: "Kvällsrutiner",
    visibleFrom: "2026-08-04T19:00:00",
    expiresAt: "2026-08-04T23:55:00"
  };

  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) =>
    route.fulfill({ json: route.request().method() === "GET" ? [EVENING_TODO] : {} })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Visa todos" }).click();

  const homeTodosCard = page.locator("article.dashboard").filter({ hasText: "Uppgifter" });
  await expect(homeTodosCard.getByText("Kvällsrutiner")).toHaveCount(0);

  // Klockan slår 19:01 — ingen omladdning, uppgiften ska dyka upp av sig
  // själv (nowTick tickar varje sekund).
  await page.clock.setSystemTime(new Date("2026-08-04T19:01:00"));
  await page.clock.runFor(2000);
  await expect(homeTodosCard.getByText("Kvällsrutiner")).toBeVisible();

  // Efter expiresAt (23:55) försvinner den igen.
  await page.clock.setSystemTime(new Date("2026-08-05T00:01:00"));
  await page.clock.runFor(2000);
  await expect(homeTodosCard.getByText("Kvällsrutiner")).toHaveCount(0);
});

test("Todos-panelen: Barn-tråden döljs som standard, en toggle i Inställningar visar den igen", async ({ page }) => {
  const CHILD_MEMBER = {
    id: "mem-child", accountId: "acc-1", userId: null, name: "Barnet", roleId: "role-child", isChild: true,
    avatarUrl: null, color: null, dashboardTheme: null, spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
  };
  const CHILD_TODO = { ...FAMILY_TODO, id: "todo-child", title: "Läxor", assignedTo: "mem-child" };
  let patchedMember: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_MEMBER] }));
  await page.route("**/api/members/mem-1", (route) => {
    if (route.request().method() === "PATCH") {
      patchedMember = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [CHILD_TODO] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByRole("region", { name: "Tråd: Barn" })).toHaveCount(0);

  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Utseende" }).click();
  await page.getByLabel("Visa barnens uppgifter i Todos-panelen").check();
  await expect.poll(() => patchedMember?.showChildTodosInOwnView).toBe(true);

  await page.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.getByRole("region", { name: "Tråd: Barn" }).getByText("Läxor")).toBeVisible();
});

// 2026-08-03 (Zaidas önskemål: "jag vill ha dem i samma rad, men att det
// inom parentes står vilken familj kategorin tillhör") — en signad uppgift
// från en annan familj grupperas nu per (kategori, familj) istället för en
// enda tråd per familj, och den nya tråd-raden ligger sida vid sida med
// mina egna trådar istället för i en egen rad under.
test("Todos-panelen: signade uppgifter från en annan familj grupperas per kategori, etiketten visar '(Familjenamn)', samma rad som mina egna trådar", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/members/cross-account", (route) =>
    route.fulfill({
      json: [{ accountId: "acc-b", accountName: "Familjen B", members: [{ id: "mem-b-a", name: "Förälder B", avatarUrl: null, color: null, isChild: false }] }]
    })
  );
  await page.route("**/api/todos/family-across-accounts", (route) =>
    route.fulfill({
      json: [{
        accountId: "acc-b",
        accountName: "Familjen B",
        myMemberId: "mem-b-a",
        categoryNames: { "cat-b-1": "Städning" },
        todos: [
          {
            id: "todo-b-cat", accountId: "acc-b", title: "Dammsuga", createdBy: "mem-b-a",
            assignedTo: null, isShared: false, status: "pending", starValue: 0,
            visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
            recurringSourceId: null, occurrenceDate: null, completedAt: null,
            approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
            rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
            personalCategoryId: "cat-b-1", notes: null, inProgressBy: ["mem-b-a"], inProgressSince: "2026-08-03T10:00:00.000Z"
          },
          {
            id: "todo-b-pool", accountId: "acc-b", title: "Handla mjölk", createdBy: "mem-b-a",
            assignedTo: null, isShared: false, status: "pending", starValue: 0,
            visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
            recurringSourceId: null, occurrenceDate: null, completedAt: null,
            approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
            rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
            personalCategoryId: null, notes: null, inProgressBy: ["mem-b-a"], inProgressSince: "2026-08-03T10:00:00.000Z"
          }
        ]
      }]
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos", exact: true }).click();

  const categoryThread = page.getByRole("region", { name: "Tråd: Städning (Familjen B)" });
  const poolThread = page.getByRole("region", { name: "Tråd: Familjen (Familjen B)" });
  await expect(categoryThread.getByText("Dammsuga")).toBeVisible();
  await expect(poolThread.getByText("Handla mjölk")).toBeVisible();
  // Den kategoriserade uppgiften hamnar INTE i pool-tråden och tvärtom.
  await expect(categoryThread.getByText("Handla mjölk")).toHaveCount(0);
  await expect(poolThread.getByText("Dammsuga")).toHaveCount(0);

  // Samma rad som mina egna trådar (Mina uppgifter) — en gemensam
  // .todo-threads-row omsluter BÅDE ParentTodoThreadView.tsx:s
  // .todo-thread-view-wrapper OCH FamilyTodoThreads.tsx:s bara
  // .todo-thread-view, istället för att de staplas som två separata rader.
  const row = page.locator(".todo-threads-row");
  await expect(row).toBeVisible();
  await expect(row.getByRole("region", { name: "Tråd: Mina uppgifter" })).toBeVisible();
  await expect(row.getByRole("region", { name: "Tråd: Städning (Familjen B)" })).toBeVisible();
});
