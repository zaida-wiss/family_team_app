import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Utökad kalenderexport (2026-07-29, del av Zaidas önskemål "all data ska
// gå att importera och exportera i de olika kategorierna i inställningar")
// — den befintliga Exportera-knappen (CalendarManagementCard.tsx) exporterar
// bara EN vald kalender i taget. Ny "Exportera alla mina kalendrar"-knapp
// slår ihop alla kalendrar man ÄGER till en enda .ics-fil.

const OWNED_CALENDAR_A = {
  id: "cal-a", name: "Jobb", color: "#2f7d6d", ownerId: "mem-1", sharedWith: [],
  importedSources: [], subscriptions: [], calDavConnections: [], deletedAt: null, deletedBy: null,
  events: [{
    id: "event-a", calendarId: "cal-a", title: "Möte", startsAt: "2026-08-01T10:00:00.000Z",
    endsAt: "2026-08-01T11:00:00.000Z", isAllDay: false, color: null, uid: null, subscriptionId: null,
    location: null, notes: null, recurrence: { type: "none", interval: 1, until: null }, attendees: [],
    symbol: null, createdBy: "mem-1", deletedAt: null, deletedBy: null
  }]
};

const OWNED_CALENDAR_B = {
  ...OWNED_CALENDAR_A, id: "cal-b", name: "Fritid",
  events: [{ ...OWNED_CALENDAR_A.events[0], id: "event-b", calendarId: "cal-b", title: "Match" }]
};

// En kalender som INTE ägs av mig (delad med mig) — ska INTE ingå i "mina" export.
const SHARED_CALENDAR = {
  ...OWNED_CALENDAR_A, id: "cal-shared", name: "Delad", ownerId: "mem-2",
  events: [{ ...OWNED_CALENDAR_A.events[0], id: "event-shared", calendarId: "cal-shared", title: "Ska inte med" }]
};

async function openCalendarSettings(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Inställningar" }).click();
  // Scopar till kategori-rutnätet — appens bottennav har en egen, likadant
  // namngiven "Kalender"-knapp synlig samtidigt. Kalender fick 2026-08-07 en
  // andra underkategori (Födelsedagar), men den flyttades 2026-08-09 ut till
  // en egen toppnivå-kategori igen — Kalender har alltså åter bara EN
  // underkategori, "hasSingleSub"-genvägen hoppar rakt till innehållet.
  await page.locator(".settings-category-grid").getByRole("button", { name: "Kalender" }).click();
}

test("Exporterar alla mina kalendrar som en enda .ics-fil, exkluderar delade kalendrar jag inte äger", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/calendars**", (route) =>
    route.fulfill({ json: [OWNED_CALENDAR_A, OWNED_CALENDAR_B, SHARED_CALENDAR] })
  );
  // Registrerad EFTER den breda mocken ovan — se samma kommentar i
  // calendar-event-symbol.spec.ts.
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
  await openCalendarSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportera alla mina kalendrar" }).click()
  ]);

  expect(download.suggestedFilename()).toBe("mina-kalendrar.ics");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8");

  expect(text).toContain("SUMMARY:Möte");
  expect(text).toContain("CATEGORIES:Jobb");
  expect(text).toContain("SUMMARY:Match");
  expect(text).toContain("CATEGORIES:Fritid");
  expect(text).not.toContain("Ska inte med");
});

test("Exportera alla mina kalendrar-knappen är avstängd om jag inte äger någon kalender", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [SHARED_CALENDAR] }));
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));
  await openCalendarSettings(page);

  await expect(page.getByRole("button", { name: "Exportera alla mina kalendrar" })).toBeDisabled();
});
