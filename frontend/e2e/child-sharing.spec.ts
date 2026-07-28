import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// Dela ett barns todos med en annan vuxen, icke-transitivt (ADR-0024,
// 2026-07-22, Zaidas beslut: "separerade föräldrar utan god relation ändå
// skall kunna dela information om ett gemensamt barn"). Två flöden testas:
// (1) Inställningar → Barn → Data → "Dela barn": sök en vuxen via
// e-post, ge access, se delningen i listan, återkalla den. (2) Todos-panelen
// (tråd-vyn): en "Delade barn"-tråd visas för barn NÅGON ANNAN delat med
// mig, med ett låst (endast visning) läge när access är "view".
//
// 2026-07-28: Dela/Överför barn flyttat från Barnkonton till en egen "Data"-
// underkategori (Zaidas önskemål) — navigeringen nedan uppdaterad.

const CHILD_A = {
  id: "mem-child-a", accountId: "acc-1", userId: null,
  name: "Nova", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

const CHILD_B = {
  id: "mem-child-b", accountId: "acc-1", userId: null,
  name: "Leo", roleId: "role-child", isChild: true,
  avatarUrl: null, color: null, dashboardTheme: null,
  spentStars: 0, approvedStars: 0, deletedAt: null, deletedBy: null
};

async function openBarnkonton(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Barn", exact: true }).click();
  await page.getByRole("button", { name: "Data", exact: true }).click();
}

test("Dela barn: söker en vuxen via e-post, ger åtkomst, ser delningen, återkallar den", async ({ page }) => {
  let shares: Record<string, unknown>[] = [];
  let shareBody: Record<string, unknown> | null = null;
  let revoked = false;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_A] }));

  await page.route("**/api/members/*/share/lookup", (route) => {
    const body = route.request().postDataJSON();
    if (body.email === "annan-foralder@exempel.se") {
      return route.fulfill({
        json: {
          memberships: [
            { memberId: "mem-other", accountId: "acc-2", memberName: "Erik", accountName: "Familjen Andersson" }
          ]
        }
      });
    }
    return route.fulfill({ json: { memberships: [] } });
  });

  await page.route("**/api/members/*/share", (route) => {
    if (route.request().method() === "POST") {
      shareBody = route.request().postDataJSON();
      shares = [
        {
          memberId: "mem-other", accountId: "acc-2", access: shareBody!.access,
          grantedBy: "mem-1", grantedAt: "2026-07-22T10:00:00.000Z",
          memberName: "Erik", accountName: "Familjen Andersson"
        }
      ];
      return route.fulfill({ status: 201, json: shares });
    }
    return route.fulfill({ json: shares });
  });

  await page.route("**/api/members/*/share/*/*", (route) => {
    revoked = true;
    shares = [];
    return route.fulfill({ json: { ok: true } });
  });

  await openBarnkonton(page);

  // Två "Sök"-knappar sedan Överför-sektionen (2026-07-27) lades till på
  // samma sida — scopar till formuläret som faktiskt innehåller e-postfältet.
  await page.getByLabel("E-post till en vuxen").fill("annan-foralder@exempel.se");
  await page
    .locator("form", { has: page.getByLabel("E-post till en vuxen") })
    .getByRole("button", { name: "Sök" })
    .click();

  await expect(page.getByText("Erik (Familjen Andersson)")).toBeVisible();
  await page.getByLabel("Åtkomst").selectOption("edit");
  await page.getByRole("button", { name: "Dela" }).click();

  await expect.poll(() => shareBody).not.toBeNull();
  expect(shareBody!.granteeMemberId).toBe("mem-other");
  expect(shareBody!.granteeAccountId).toBe("acc-2");
  expect(shareBody!.access).toBe("edit");

  // 2026-07-28, Zaidas önskemål: bekräftelse-listan ska visa vilket barn +
  // vem det delas med, inte bara behörighetsnivån.
  await expect(page.getByText("Nova")).toBeVisible();
  await expect(page.getByText("delas med Erik (Familjen Andersson)")).toBeVisible();
  await expect(page.getByText("Kan redigera")).toBeVisible();

  await page.getByRole("button", { name: "Ta bort delning av Nova med Erik" }).click();
  await expect.poll(() => revoked).toBe(true);
  await expect(page.getByText("Kan redigera")).not.toBeVisible();
});

// 2026-07-28, Zaidas önskemål: "man ska även kunna välja flera barn på en
// gång, inte bara ett i taget" — kryssar i BÅDA barnen, delar med samma
// mottagare i en enda åtgärd (ett POST-anrop per barn), och listan visar
// därefter en rad PER BARN, tydligt namngivna.
test("Dela barn: kan välja flera barn samtidigt, delar med samma mottagare i en åtgärd", async ({ page }) => {
  const shareCalls: Record<string, unknown>[] = [];

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_A, CHILD_B] }));

  await page.route("**/api/members/*/share/lookup", (route) =>
    route.fulfill({
      json: {
        memberships: [
          { memberId: "mem-other", accountId: "acc-2", memberName: "Erik", accountName: "Familjen Andersson" }
        ]
      }
    })
  );

  await page.route(/\/api\/members\/(mem-child-a|mem-child-b)\/share$/, (route) => {
    if (route.request().method() === "POST") {
      shareCalls.push({ childId: route.request().url(), ...(route.request().postDataJSON() as object) });
      return route.fulfill({ status: 201, json: [] });
    }
    return route.fulfill({ json: [] });
  });

  await openBarnkonton(page);

  const picker = page.getByRole("group", { name: "Vilka barn ska delas?" });
  await expect(picker.getByRole("button", { name: "Nova" })).toBeVisible();
  await picker.getByRole("button", { name: "Nova" }).click();
  await picker.getByRole("button", { name: "Leo" }).click();

  await page.getByLabel("E-post till en vuxen").fill("annan-foralder@exempel.se");
  await page
    .locator("form", { has: page.getByLabel("E-post till en vuxen") })
    .getByRole("button", { name: "Sök" })
    .click();

  await expect(page.getByText("Erik (Familjen Andersson)")).toBeVisible();
  await page.getByRole("button", { name: "Dela (2)" }).click();

  await expect.poll(() => shareCalls.length).toBe(2);
  expect(shareCalls.some((c) => (c.childId as string).includes("mem-child-a"))).toBe(true);
  expect(shareCalls.some((c) => (c.childId as string).includes("mem-child-b"))).toBe(true);
});

// 2026-07-27, Zaidas önskemål: "jag ska även kunna... överföra dem till
// andra familjer" — permanent, oåterkallelig flytt av hela medlemskapet,
// till skillnad från delning ovan (som alltid går att återkalla). Kräver
// två klick ("Överför" → "Bekräfta överföring") innan anropet faktiskt görs.
test("Överför barn: söker en familj via e-post, kräver två klick för att bekräfta, anropar transfer-endpointen", async ({ page }) => {
  let transferBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_A] }));

  await page.route("**/api/members/*/share/lookup", (route) => {
    const body = route.request().postDataJSON();
    if (body.email === "andra-familjen@exempel.se") {
      return route.fulfill({
        json: {
          memberships: [
            { memberId: "mem-other", accountId: "acc-2", memberName: "Erik", accountName: "Familjen Andersson" }
          ]
        }
      });
    }
    return route.fulfill({ json: { memberships: [] } });
  });
  await page.route("**/api/members/*/transfer", (route) => {
    transferBody = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });

  await openBarnkonton(page);

  await page.getByLabel("E-post till mottagande familjs vuxen").fill("andra-familjen@exempel.se");
  await page
    .locator("form", { has: page.getByLabel("E-post till mottagande familjs vuxen") })
    .getByRole("button", { name: "Sök" })
    .click();
  await expect(page.getByText("Erik (Familjen Andersson)")).toBeVisible();

  const transferButton = page.getByRole("button", { name: "Överför" });
  await transferButton.click();
  expect(transferBody).toBeNull();

  await page.getByRole("button", { name: "Bekräfta överföring" }).click();
  await expect.poll(() => transferBody).not.toBeNull();
  expect(transferBody!.targetMemberId).toBe("mem-other");
  expect(transferBody!.targetAccountId).toBe("acc-2");
});

// 2026-07-29, Zaidas önskemål: "jag ska kunna välja relation till personen
// barn delas med och vilket tidsspann delningen gäller. tills vidare, eller
// tex bara under en semestervecka."
test("Dela barn: kan välja relation och ett tidsspann, skickas med i delningen", async ({ page }) => {
  let shareBody: Record<string, unknown> | null = null;

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER, CHILD_A] }));
  await page.route("**/api/members/*/share/lookup", (route) =>
    route.fulfill({
      json: { memberships: [{ memberId: "mem-other", accountId: "acc-2", memberName: "Erik", accountName: "Familjen Andersson" }] }
    })
  );
  await page.route("**/api/members/*/share", (route) => {
    if (route.request().method() === "POST") {
      shareBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: [] });
    }
    return route.fulfill({ json: [] });
  });

  await openBarnkonton(page);
  await page.getByLabel("E-post till en vuxen").fill("erik@exempel.se");
  await page
    .locator("form", { has: page.getByLabel("E-post till en vuxen") })
    .getByRole("button", { name: "Sök" })
    .click();
  await expect(page.getByText("Erik (Familjen Andersson)")).toBeVisible();

  await page.getByLabel("Relation till personen").fill("Mormor");
  await page.getByRole("radio", { name: "Till ett visst datum" }).check();
  await page.getByLabel("Delningen gäller till och med").fill("2026-08-15");
  await page.getByRole("button", { name: "Dela" }).click();

  await expect.poll(() => shareBody).not.toBeNull();
  expect(shareBody!.relation).toBe("Mormor");
  expect(new Date(shareBody!.expiresAt as string).toISOString().slice(0, 10)).toBe("2026-08-15");
});

// Mottagarsidan (2026-07-29) — en väntande delning visas i Inställningar →
// Barn → Data (även för ett konto UTAN egna barn, se PendingChildShares.tsx)
// och kan accepteras eller avböjas.
test("Väntande delningar: kan accepteras eller avböjas", async ({ page }) => {
  const PENDING = {
    childId: "mem-other-child", childAccountId: "acc-2", childName: "Sara",
    homeAccountName: "Familjen Andersson", grantedByName: "Erik",
    access: "edit", relation: "Faster", expiresAt: null
  };
  let accepted: string | null = null;
  let declined: string | null = null;
  let pendingList = [PENDING];

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/members/pending-child-shares", (route) => route.fulfill({ json: pendingList }));
  await page.route("**/api/members/pending-child-shares/acc-2/mem-other-child/accept", (route) => {
    accepted = "mem-other-child";
    pendingList = [];
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/members/pending-child-shares/acc-2/mem-other-child/decline", (route) => {
    declined = "mem-other-child";
    pendingList = [];
    return route.fulfill({ json: { ok: true } });
  });

  await openBarnkonton(page);

  await expect(page.getByText("Sara")).toBeVisible();
  await expect(page.getByText(/Familjen Andersson.*delas av Erik, Faster/)).toBeVisible();
  await expect(page.getByText("Full åtkomst (kan godkänna/redigera)")).toBeVisible();
  await expect(page.getByText("gäller tills vidare")).toBeVisible();

  await page.getByRole("button", { name: "Acceptera" }).click();
  await expect.poll(() => accepted).toBe("mem-other-child");
  await expect(page.getByText("Sara")).not.toBeVisible();

  expect(declined).toBeNull();
});

// Placeringsbeslut (2026-07-29, Zaidas svar: "barnet skall vara på samma
// ställe, men med en text under som informerar") — ett accepterat delat barn
// syns i Familjemedlemmar-listan bland riktiga medlemmar, med en informerande
// undertext (vilken familj det delas av, relation, åtkomstnivå).
test("Familjemedlemmar: ett delat barn visas i listan med en informerande text", async ({ page }) => {
  const SHARED = {
    child: { id: "mem-other-child", accountId: "acc-2", name: "Sara", avatarUrl: null, color: null, dashboardTheme: null },
    access: "view", homeAccountName: "Familjen Andersson", relation: "Faster",
    todos: [], calendarEvents: [], purchasedRewards: [], stars: { approved: 12, spent: 4 }, timedTasks: []
  };

  await mockAuthAndData(page);
  await page.route("**/api/members", (route) => route.fulfill({ json: [MEMBER] }));
  await page.route("**/api/todos/shared-children", (route) => route.fulfill({ json: [SHARED] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  await page.getByRole("button", { name: "Familj" }).click();
  await page.getByRole("button", { name: "Familjemedlemmar" }).click();

  await expect(page.getByText("Sara")).toBeVisible();
  await expect(page.getByText(/Delas av Familjen Andersson.*Faster.*kan bara visa/)).toBeVisible();
});

test("Todos-panelen: en delad barn-tråd visas med visnings-läge när access är 'view'", async ({ page }) => {
  const SHARED_TODO = {
    id: "todo-shared-1", accountId: "acc-2", title: "Läxor", createdBy: "mem-other-parent",
    assignedTo: "mem-other-child", isShared: false, status: "pending", starValue: 3,
    visual: { type: "lucide-icon", value: "BookOpen" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null,
    visibleFrom: null, expiresAt: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };

  await mockAuthAndData(page);
  await page.route("**/api/todos/shared-children", (route) =>
    route.fulfill({
      json: [
        {
          child: {
            id: "mem-other-child", accountId: "acc-2", name: "Wilma",
            avatarUrl: null, color: null, dashboardTheme: null
          },
          access: "view",
          todos: [SHARED_TODO],
          calendarEvents: [], purchasedRewards: [], stars: { approved: 0, spent: 0 }, timedTasks: []
        }
      ]
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const sharedThread = page.getByRole("region", { name: "Delad tråd: Wilma" });
  await expect(sharedThread).toBeVisible();
  await expect(sharedThread.getByText("Läxor")).toBeVisible();
  await expect(sharedThread.locator(".shared-child-thread__lock")).toBeVisible();
  await expect(sharedThread.getByRole("button", { name: /Endast visning/ })).toBeDisabled();
});

// 2026-07-27, Zaidas önskemål: "en förälder som tillhör en annan familj ska
// få åtkomst till allt som är kopplat till barnets konto" — kalender/
// belöningar/Medaljer visas nu också, bakom en egen info-knapp (progressiv
// avslöjning, döljs tills man klickar).
test("Todos-panelen: info-knappen visar barnets kalender, köpta belöningar, stjärnor och Medaljer", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todos/shared-children", (route) =>
    route.fulfill({
      json: [
        {
          child: {
            id: "mem-other-child", accountId: "acc-2", name: "Wilma",
            avatarUrl: null, color: null, dashboardTheme: null
          },
          access: "view",
          todos: [],
          calendarEvents: [
            { id: "ev-1", calendarId: "cal-1", calendarName: "Wilmas kalender", title: "Tandläkare", startsAt: "2026-08-01T10:00:00.000Z", endsAt: "2026-08-01T11:00:00.000Z", isAllDay: false, color: null, uid: null, subscriptionId: null, location: null, notes: null, recurrence: { type: "none", interval: 1, until: null }, attendees: [], symbol: null, createdBy: "mem-other-parent", deletedAt: null, deletedBy: null }
          ],
          purchasedRewards: [
            { id: "pr-1", accountId: "acc-2", memberId: "mem-other-child", itemTitle: "Glass", itemSymbol: null, starCost: 5, purchasedAt: "2026-07-20T10:00:00.000Z", startsAt: "2026-07-20T10:00:00.000Z", durationMinutes: null, deletedAt: null }
          ],
          stars: { approved: 30, spent: 5 },
          timedTasks: [
            { id: "tt-1", accountId: "acc-2", title: "Springa", symbol: "🏃", assignedTo: "mem-other-child", createdBy: "mem-other-parent", deletedAt: null, deletedBy: null, bestDurationMs: 65000, bestAchievedAt: "2026-07-15T10:00:00.000Z", attemptCount: 3 }
          ]
        }
      ]
    })
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const sharedThread = page.getByRole("region", { name: "Delad tråd: Wilma" });
  await expect(sharedThread.getByText("Tandläkare")).toHaveCount(0);

  await sharedThread.getByRole("button", { name: /Mer om Wilma/ }).click();
  await expect(sharedThread.getByText("⭐ 25 stjärnor")).toBeVisible();
  await expect(sharedThread.getByText(/Tandläkare/)).toBeVisible();
  await expect(sharedThread.getByText(/Glass \(5 ⭐\)/)).toBeVisible();
  await expect(sharedThread.getByText(/Springa: 1:05/)).toBeVisible();
});

test("Todos-panelen: markera en delad uppgift klar (edit-åtkomst) anropar completeShared-endpointen", async ({ page }) => {
  const SHARED_TODO = {
    id: "todo-shared-2", accountId: "acc-2", title: "Diska", createdBy: "mem-other-parent",
    assignedTo: "mem-other-child", isShared: false, status: "pending", starValue: 2,
    visual: { type: "lucide-icon", value: "Sparkles" }, recurrence: { type: "none" },
    recurringSourceId: null, occurrenceDate: null,
    visibleFrom: null, expiresAt: null,
    completedAt: null, approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    rejectedReason: null, deletedAt: null, deletedBy: null,
    personalCategoryId: null, notes: null
  };
  let completedCalled = false;

  await mockAuthAndData(page);
  await page.route("**/api/todos/shared-children", (route) =>
    route.fulfill({
      json: [
        {
          child: {
            id: "mem-other-child", accountId: "acc-2", name: "Wilma",
            avatarUrl: null, color: null, dashboardTheme: null
          },
          access: "edit",
          todos: completedCalled ? [] : [SHARED_TODO],
          calendarEvents: [], purchasedRewards: [], stars: { approved: 0, spent: 0 }, timedTasks: []
        }
      ]
    })
  );
  await page.route("**/api/todos/shared/acc-2/mem-other-child/todo-shared-2/complete", (route) => {
    completedCalled = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const sharedThread = page.getByRole("region", { name: "Delad tråd: Wilma" });
  const ball = sharedThread.getByRole("button", { name: /Diska/ });
  await expect(ball).toBeEnabled();

  // Håll intryckt 2s (samma mönster/testkonvention som ParentTodoThreadView.tsx:s
  // egen håll-in-avklarmarkering, se parent-todo-thread-view.spec.ts) —
  // dispatchar pointer-eventet direkt på elementet istället för page.mouse,
  // setTimeout:en i webbläsaren löper ut av sig själv medan expect.poll väntar.
  await ball.dispatchEvent("pointerdown", { pointerId: 1, button: 0 });

  await expect.poll(() => completedCalled).toBe(true);
});
