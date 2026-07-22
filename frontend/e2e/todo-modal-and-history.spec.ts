import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// S3 (Sprint 3): "Skapa todo" flyttad från inline-formulär till modal; historik
// (godkända/nekade uppgifter) flyttad ur den aktiva Todos-vyn till en skrollbar
// sektion i Inställningar, så den aktiva vyn inte samlar på sig avslutad historik.

const APPROVED_TODO = {
  id: "todo-approved",
  accountId: "acc-1",
  title: "Diska",
  createdBy: "mem-1",
  assignedTo: "mem-1",
  isShared: false,
  status: "approved",
  starValue: 4,
  visual: { type: "lucide-icon", value: "Star" },
  recurrence: { type: "none" },
  completedAt: "2026-06-01T10:00:00.000Z",
  approvedBy: "mem-1",
  approvedAt: "2026-06-01T11:00:00.000Z",
  rejectedBy: null,
  rejectedAt: null,
  rejectedReason: null,
  visibleFrom: null,
  expiresAt: null,
  recurringSourceId: null,
  occurrenceDate: null,
  deletedAt: null,
  deletedBy: null,
};

const PENDING_TODO = {
  ...APPROVED_TODO,
  id: "todo-pending",
  title: "Dammsuga",
  status: "pending",
  completedAt: null,
  approvedBy: null,
  approvedAt: null,
};

// Reproducerar buggen Zaida hittade i produktion 3 juli: expired räknades inte som
// historik i första versionen av S3, så utgångna uppgifter fortsatte synas i den
// aktiva Todos-listan.
const EXPIRED_TODO = {
  ...APPROVED_TODO,
  id: "todo-expired",
  title: "Duka undan",
  status: "expired",
  completedAt: null,
  approvedBy: null,
  approvedAt: null,
  expiresAt: "2026-06-02T00:00:00.000Z",
};

test.describe("Todos: skapa-modal och historik i Inställningar", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAndData(page);
  });

  test("Ny uppgift öppnas som modal, inte inline-formulär", async ({ page }) => {
    await page.route("**/api/todos", (route) =>
      route.fulfill({ json: route.request().method() === "GET" ? [] : {} })
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Todos" }).click();

    await expect(page.getByRole("dialog", { name: "Ny uppgift" })).toHaveCount(0);
    // Den fristående +-knappen togs bort 2026-07-06 — nya uppgifter skapas via
    // en trådens "Lägg till uppgift"-menyval, Barn-tråden som fallback utan
    // egna kategorier.
    await page.getByRole("region", { name: "Tråd: Barn" }).getByRole("button", { name: /Barn/ }).click();
    await page.getByRole("button", { name: "Lägg till uppgift" }).click();
    await expect(page.getByRole("dialog", { name: "Ny uppgift" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Ny uppgift" })).toHaveCount(0);
  });

  test("Godkänd och utgången uppgift visas inte i aktiva Todos-listan, men syns i Inställningars historik", async ({ page }) => {
    await page.route("**/api/todos", (route) =>
      route.fulfill({ json: route.request().method() === "GET" ? [APPROVED_TODO, PENDING_TODO, EXPIRED_TODO] : {} })
    );

    await page.goto("/");
    // Tråd-läget (bubbelvyn) är default sedan 2026-07-05, listläget väljs i
    // Inställningar (ingen egen växlare i panelen) — den här testen
    // kontrollerar listlägets aktiva/historik-filtrering, växlar dit explicit.
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Konto & familj" }).click();
    await page.getByRole("button", { name: "Utseende" }).click();
    await page.getByLabel("Todos-vy").selectOption("list");
    await page.getByRole("button", { name: "Todos" }).click();

    await expect(page.getByText("Dammsuga")).toBeVisible();
    await expect(page.getByText("Diska")).toHaveCount(0);
    await expect(page.getByText("Duka undan")).toHaveCount(0);

    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Todo-lista" }).click();
    await page.getByRole("button", { name: "📋 Todo-historik" }).click();

    await expect(page.getByText("Diska")).toBeVisible();
    await expect(page.getByText("Godkänd", { exact: true })).toBeVisible();
    await expect(page.getByText("Duka undan")).toBeVisible();
    await expect(page.getByText("Utgången", { exact: true })).toBeVisible();
  });

  // 2026-07-06 (Zaidas fråga: var rättar man ett fel datum på en engångsuppgift?):
  // listlägets pennikon öppnade tidigare bara en inline-titel-redigering, som
  // inte kunde ändra Syns från/Försvinner — en återvändsgränd, eftersom
  // tråd-vyn (den enda andra platsen redigera-modalen nåddes ifrån) bara visar
  // dagens todos och därför gömmer precis den uppgift man behöver rätta.
  // Pennikonen öppnar nu samma fullständiga redigera-modal som tråd-vyn.
  test("Redigera i listläget öppnar den fullständiga redigera-modalen, inte inline-titel", async ({ page }) => {
    await page.route("**/api/todos", (route) =>
      route.fulfill({ json: route.request().method() === "GET" ? [PENDING_TODO] : {} })
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Konto & familj" }).click();
    await page.getByRole("button", { name: "Utseende" }).click();
    await page.getByLabel("Todos-vy").selectOption("list");
    await page.getByRole("button", { name: "Todos" }).click();

    await page.getByRole("button", { name: "Redigera" }).click();

    const dialog = page.getByRole("dialog", { name: "Redigera uppgift" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Syns från")).toBeVisible();
    await expect(dialog.getByLabel("Försvinner")).toBeVisible();
  });

  // 2026-07-08 (Zaidas fråga: "jag verkar inte kunna se todos som inte är
  // återkommande i Inställningar") — en aktiv engångsuppgift gick tidigare
  // bara att hitta i tråd-vyn/listläget (kräver att man vet vilken kategori
  // den ligger i). Ny "📌 Engångsuppgifter"-sektion samlar dem på ett ställe,
  // med samma Redigera/Ta bort-mönster som Återkommande uppgifter redan har.
  test("Engångsuppgifter listas i Inställningar, återkommande mallar och historik gör det inte", async ({ page }) => {
    const RECURRING_TEMPLATE = {
      ...APPROVED_TODO,
      id: "todo-template",
      title: "Borsta tänderna",
      status: "pending",
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null }
    };
    const OCCURRENCE = {
      ...PENDING_TODO,
      id: "todo-occurrence",
      title: "Borsta tänderna (idag)",
      recurringSourceId: "todo-template"
    };

    await page.route("**/api/todos", (route) =>
      route.fulfill({
        json:
          route.request().method() === "GET"
            ? [PENDING_TODO, RECURRING_TEMPLATE, OCCURRENCE, APPROVED_TODO, EXPIRED_TODO]
            : {}
      })
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Todo-lista" }).click();
    await page.getByRole("button", { name: "📌 Engångsuppgifter" }).click();

    const rows = page.locator(".one-off-todos-settings__row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Dammsuga");
  });

  test("Engångsuppgifter: pennikonen öppnar redigera-modalen, papperskorgen tar bort uppgiften", async ({ page }) => {
    let deletedId: string | null = null;
    await page.route("**/api/todos", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: [PENDING_TODO] });
      return route.fulfill({ json: {} });
    });
    await page.route("**/api/todos/todo-pending", (route) => {
      if (route.request().method() === "DELETE") deletedId = "todo-pending";
      return route.fulfill({ json: {} });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Inställningar" }).click();
    await page.getByRole("button", { name: "Todo-lista" }).click();
    await page.getByRole("button", { name: "📌 Engångsuppgifter" }).click();

    await page.getByRole("button", { name: "Redigera Dammsuga" }).click();
    await expect(page.getByRole("dialog", { name: "Redigera uppgift" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Ta bort Dammsuga" }).click();
    await expect.poll(() => deletedId).toBe("todo-pending");
  });
});
