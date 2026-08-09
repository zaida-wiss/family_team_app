import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Verifierar hela vägen genom en RIKTIG renderad sida (inte bara den rena
// linkifyText-funktionen, som redan täcks av tests/useLinkifiedText.test.ts)
// att telefonnummer/e-post i fri text OCH CalendarEvent.location faktiskt
// blir klickbara i den riktiga komponentträdet — den typen av integrations-
// gap (fel klass inte laddad, hooken aldrig anropad i den faktiska render-
// vägen) som rena funktionstester inte kan fånga (2026-08-10, uppföljning
// av Zaidas fynd: "jag kan inte se att varken adresser, telefonnummer eller
// mailadress är klickbara nu").

const CATEGORY = {
  id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Hushåll",
  createdAt: "2024-01-01T00:00:00.000Z", deletedAt: null, deletedBy: null,
};

const TODO_WITH_CONTACT_NOTES = {
  id: "todo-1", accountId: "acc-1", title: "Ring hantverkaren", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 0,
  visual: { type: "lucide-icon", value: "Star" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: "cat-1",
  notes: "Ring 070-123 45 67 eller mejla info@hantverkarna.se om det behövs",
};

async function openThreadView(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Todos", exact: true }).click();
}

test("Todo-anteckningar: telefonnummer OCH e-postadress blir riktiga klickbara länkar i visa-vyn", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY] }));
  await page.route("**/api/todos", (route) => route.fulfill({ json: [TODO_WITH_CONTACT_NOTES] }));

  await openThreadView(page);
  await page.getByRole("button", { name: /Ring hantverkaren/ }).click();

  const dialog = page.getByRole("dialog");
  const phoneLink = dialog.locator('a.linkified-link[href="tel:0701234567"]');
  const emailLink = dialog.locator('a.linkified-link[href="mailto:info@hantverkarna.se"]');
  await expect(phoneLink).toBeVisible();
  await expect(phoneLink).toHaveText("070-123 45 67");
  await expect(emailLink).toBeVisible();
  await expect(emailLink).toHaveText("info@hantverkarna.se");
});

const now = new Date();
// EN NY tidsberoende testfälla hittad och fixad (2026-08-10, CI-fel #466) —
// ett hårdkodat "09:00–10:00" (kopierat från calendar-event-symbol.spec.ts,
// som bara klickar i månadsrutnätet, inte listan) föll i CI eftersom
// useCalendarView.ts:s "listan under griden"-filter (isNotPast) exkluderar
// en händelse vars endsAt redan passerat — ett 09–10-möte räknas som förbi
// så fort testet körs EFTER kl. 10 på dagen, oavsett datum. Månadsrutnätet
// filtrerar INTE på detta (därför syntes "Frisören" där men inte i listan
// `.cal-event-row-title` som testet faktiskt klickar på). Räknat relativt
// `Date.now()` istället för ett fast klockslag — alltid i framtiden,
// oavsett vilken tid på dygnet CI råkar köra.
const eventStart = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
const eventEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

const CALENDAR = {
  id: "cal-1", name: "Testförälderns kalender", ownerId: "mem-1", color: "#2f7d6d",
  sharedWith: [], deletedAt: null, deletedBy: null, keepAllHistory: false,
  importedSources: [], subscriptions: [], calDavConnections: [],
  events: [{
    id: "ev-1", calendarId: "cal-1", title: "Frisören", startsAt: eventStart, endsAt: eventEnd,
    isAllDay: false, color: null, uid: null, subscriptionId: null,
    location: "Storgatan 12, Stockholm",
    notes: "Ring gärna 08-123 456 78 om du blir sen",
    recurrence: { type: "none" }, attendees: [], symbol: null,
    createdBy: "mem-1", deletedAt: null, deletedBy: null,
  }],
};

test("Kalenderhändelse: platsen blir en kart-länk och anteckningens telefonnummer blir en tel:-länk", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/calendars**", (route) => route.fulfill({ json: [CALENDAR] }));
  // Registrerade EFTER den breda mocken ovan (Playwright: senast
  // registrerad matchning vinner) — samma etablerade mönster som övriga
  // kalender-e2e-test i sviten.
  await page.route("**/api/calendars/cross-account**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/calendars/connections**", (route) => route.fulfill({ json: [] }));

  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await page.locator(".cal-event-row-title", { hasText: "Frisören" }).click();

  const dialog = page.getByRole("dialog");
  const mapsLink = dialog.locator("a.linkified-link", { hasText: "Storgatan 12, Stockholm" });
  await expect(mapsLink).toBeVisible();
  await expect(mapsLink).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=Storgatan%2012%2C%20Stockholm"
  );
  await expect(mapsLink).toHaveAttribute("target", "_blank");

  const phoneLink = dialog.locator('a.linkified-link[href="tel:0812345678"]');
  await expect(phoneLink).toBeVisible();
});
