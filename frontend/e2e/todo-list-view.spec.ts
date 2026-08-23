import { test, expect } from "@playwright/test";
import { mockAuthAndData, MEMBER } from "./helpers";

// 2026-08-23, Zaidas önskemål: "todo som inte är i bollform, utan listform"
// ska få ett liknande utseende — TodosView.tsx:s listläge var tidigare rent
// textbaserat (bara titel/ansvarig/stjärnsumma), utan den emoji-ikon eller
// kategorifärg som bollformen (ParentTodoThreadView.tsx) redan har. Avgränsat
// till just utseende/färg (inte håll-in/delmoment/gruppering, se
// AskUserQuestion-svaret samma dag).

const CATEGORY_A = { id: "cat-a", accountId: "acc-1", memberId: "mem-1", name: "Hemma", createdAt: "2024-01-01T00:00:00.000Z" };
const CATEGORY_B = { id: "cat-b", accountId: "acc-1", memberId: "mem-1", name: "Jobb", createdAt: "2024-01-01T00:00:00.000Z" };

const TODO_WITH_CATEGORY = {
  id: "todo-1", accountId: "acc-1", title: "Diska", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 5,
  visual: { type: "lucide-icon", value: "🧺" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: "cat-a", notes: null,
};

const TODO_NO_CATEGORY = {
  id: "todo-2", accountId: "acc-1", title: "Handla mat", createdBy: "mem-1",
  assignedTo: "mem-1", isShared: false, status: "pending", starValue: 5,
  visual: { type: "lucide-icon", value: "" }, recurrence: { type: "none" },
  recurringSourceId: null, occurrenceDate: null, completedAt: null,
  approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
  rejectedReason: null, visibleFrom: null, expiresAt: null, deletedAt: null, deletedBy: null,
  personalCategoryId: null, notes: null,
};

test("listläget: en kategoriserad todo får samma kategorifärg och emoji-ikon som bollformen skulle gett", async ({ page }) => {
  await mockAuthAndData(page);
  await page.route("**/api/members", (route) =>
    route.fulfill({ json: [{ ...MEMBER, todoViewMode: "list" }] })
  );
  await page.route("**/api/todo-categories", (route) => route.fulfill({ json: [CATEGORY_A, CATEGORY_B] }));
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [TODO_WITH_CATEGORY, TODO_NO_CATEGORY] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos", exact: true }).click();

  const categorizedRow = page.locator(".todo-dashboard-row", { hasText: "Diska" });
  await expect(categorizedRow).toBeVisible();
  const icon = categorizedRow.locator(".todo-list-row__icon");
  await expect(icon).toHaveText("🧺");

  const fallbackIcon = page.locator(".todo-dashboard-row", { hasText: "Handla mat" }).locator(".todo-list-row__icon");
  await expect(fallbackIcon).toBeVisible();

  // cat-a är den FÖRSTA (index 0) icke-dolda, icke-familje-kategorin ägd av
  // mem-1 — samma ordning som ParentTodoThreadView.tsx:s myCategories-filter
  // skulle ge, så accenten ska vara exakt samma color-mix-uttryck som
  // .todo-list-row__icon-regeln (TodosView.css) bygger med var(--c0) — inte
  // en godtycklig annan färg, och inte den kategorilösa fallback-accenten
  // (var(--primary)). Medvetet INTE cat-b/--c1 — i standardtemat "Klar" är
  // --c1 literally === var(--primary) (en enfärgad, primary-derived skala,
  // se themes.css), vilket hade gjort testet meningslöst likadant för båda
  // raderna av en ren tema-slump, inte en bugg i själva färgvalet.
  const [actualBg, actualFallbackBg, expectedBg, expectedFallbackBg] = await page.evaluate(() => {
    function resolveBackground(expr: string): string {
      // Måste bifogas INUTI .app-shell, inte document.body — --c1/--primary
      // m.fl. är scopade till .app-shell.theme-X (themes.css), en sidosyskon-
      // nod till .app-shell hade fått dem OSATTA och color-mix() hade tyst
      // fallit tillbaka på transparent.
      const el = document.createElement("div");
      el.style.background = expr;
      document.querySelector(".app-shell")!.appendChild(el);
      const resolved = getComputedStyle(el).backgroundColor;
      el.remove();
      return resolved;
    }
    const icons = document.querySelectorAll(".todo-list-row__icon");
    const categorized = Array.from(icons).find((el) => el.textContent === "🧺")!;
    const fallback = Array.from(icons).find((el) => el.textContent === "")!;
    return [
      getComputedStyle(categorized).backgroundColor,
      getComputedStyle(fallback).backgroundColor,
      resolveBackground("color-mix(in srgb, var(--c0) 22%, var(--card))"),
      resolveBackground("color-mix(in srgb, var(--primary) 22%, var(--card))"),
    ];
  });
  expect(actualBg).toBe(expectedBg);
  expect(actualFallbackBg).toBe(expectedFallbackBg);
  expect(actualBg).not.toBe(actualFallbackBg);
});
