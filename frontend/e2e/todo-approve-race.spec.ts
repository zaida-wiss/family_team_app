import { test, expect } from "@playwright/test";
import { mockAuthAndData } from "./helpers";

// Zaida rapporterade 2026-07-04: en godkänd todo försvinner (korrekt, flyttas till
// historik) men "kommer sedan tillbaka". Grundorsak: refreshTodos() triggas från
// fyra oberoende källor (mount/SSE/visibilitychange/30s-intervall). Om en av dem
// hinner svara med en server-snapshot från INNAN godkänn-anropet landat, skriver
// den över den optimistiska uppdateringen — todon "studsar tillbaka" till väntande
// tills nästa refresh rättar till det igen. Redan diagnostiserad i backloggen (S7),
// fixad här: todo-id med en pågående mutation skyddas mot att skrivas över av en
// ANNAN, oberoende refresh tills mutationen själv bekräftat resultatet.

const DONE_TODO = {
  id: "todo-1",
  accountId: "acc-1",
  title: "Duka bordet",
  createdBy: "mem-1",
  assignedTo: "mem-1",
  isShared: false,
  starValue: 5,
  visual: { type: "lucide-icon", value: "Star" },
  recurrence: { type: "none" },
  completedAt: new Date().toISOString(),
  approvedBy: null,
  approvedAt: null,
  rejectedBy: null,
  rejectedAt: null,
  rejectedReason: null,
  expiresAt: null,
  recurringSourceId: null,
  occurrenceDate: null,
  deletedAt: null,
  deletedBy: null,
};

test("Godkänd todo förblir godkänd även om en oberoende bakgrundsrefresh svarar med gammal data mitt i", async ({ page }) => {
  let approvedOnServer = false;

  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: [{ ...DONE_TODO, status: approvedOnServer ? "approved" : "done" }],
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-1/approve", async (route) => {
    // Simulerar ett långsamt serveranrop — ger ett tidsfönster där en ANNAN,
    // oberoende refresh (här: visibilitychange) hinner svara med gammal data.
    await new Promise((resolve) => setTimeout(resolve, 400));
    approvedOnServer = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const approvalPanel = page.getByRole("region", { name: "Uppgifter att godkänna" });
  await expect(approvalPanel.getByText("Duka bordet")).toBeVisible();

  await approvalPanel.getByTitle("Godkänn").click();
  // Optimistisk uppdatering — uppgiften ska genast lämna godkänn-listan.
  await expect(approvalPanel.getByText("Duka bordet")).toHaveCount(0);

  // Trigga en oberoende bakgrundsrefresh MEDAN godkänn-anropet fortfarande
  // pågår (approvedOnServer är fortfarande false på servern just nu).
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  // Viktigt: en vanlig auto-retrying expect().toHaveCount() skulle missa buggen
  // här — den polling:ar tills den lyckas (upp till 5s), och buggen är bara
  // transient (rättas till efter 400ms av mutationens egen avslutande refresh).
  // En engångskontroll mitt i race-fönstret krävs för att fånga den.
  await page.waitForTimeout(100);
  const countDuringRace = await approvalPanel.getByText("Duka bordet").count();
  expect(countDuringRace).toBe(0);

  // Vänta ut det långsamma godkänn-anropet och dess egna avslutande refresh.
  await page.waitForTimeout(600);
  await expect(approvalPanel.getByText("Duka bordet")).toHaveCount(0);
});

// Zaida rapporterade 2026-07-04 (efter cache-fixen ovan): godkänner man EN todo i
// taget fungerar det, men godkänner man MÅNGA i snabb följd studsar nästan alla
// (utom en) tillbaka efter en sidomladdning. Grundorsak: den gemensamma
// finally-blocket i approveTodo/rejectTodo tog bort pendingMutationIds-skyddet så
// fort DESS EGEN refreshTodos()-anrop avslutades — även om det anropet självt var
// inaktuellt (förkastat p.g.a. token-racet) och ALDRIG faktiskt bekräftat något.
// Om en ANNAN, oberoende bakgrundsrefresh (SSE/visibilitychange/intervall) sedan
// råkar vinna racet med en serversnapshot som inte hunnit se godkännandet, fanns
// inget skydd kvar och todon skrevs tillbaka till "väntar". Fixat genom att flytta
// skyddsborttagningen in i refreshTodos() själv — den tas bara bort när den
// hämtade datan FAKTISKT bekräftar den optimistiska statusen.
test("Godkänd todo förblir godkänd även om den egna mutationens refresh förkastas och flera oberoende bakgrundsrefreshar i rad ser en inaktuell serversnapshot", async ({ page }) => {
  let getCallCount = 0;
  // Delay (ms) per GET-anrop i ordning: mount, egen-mutationens refresh (långsam —
  // hinner bli inaktuell/förkastad), två oberoende bakgrundsrefreshar (snabba —
  // vinner token-racet var för sig). Servern bekräftar aldrig godkännandet i den
  // här testkörningen (simulerar en läsväg som släpar efter skrivningen) — poängen
  // är att klienten ändå aldrig får skriva tillbaka en bekräftat godkänd todo.
  const getDelays = [0, 400, 50, 50];

  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      const delay = getDelays[Math.min(getCallCount, getDelays.length - 1)];
      getCallCount += 1;
      return new Promise((resolve) => {
        setTimeout(
          () => resolve(route.fulfill({ json: [{ ...DONE_TODO, status: "done" }] })),
          delay
        );
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/todos/todo-1/approve", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const approvalPanel = page.getByRole("region", { name: "Uppgifter att godkänna" });
  await expect(approvalPanel.getByText("Duka bordet")).toBeVisible();

  await approvalPanel.getByTitle("Godkänn").click();
  await expect(approvalPanel.getByText("Duka bordet")).toHaveCount(0);

  // t≈300: godkänn-anropet landar, dess egen refresh (GET #2, 400ms) dispatchas.
  // t≈400: en oberoende bakgrundsrefresh (GET #3, 50ms) dispatchas och vinner
  // racet före den egna — precis som i testet ovan, ingen bugg ännu här.
  await page.waitForTimeout(400);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(150);
  await expect(approvalPanel.getByText("Duka bordet")).toHaveCount(0);

  // t≈700: den egna (nu inaktuella) refreshen avslutas till slut och förkastas —
  // det är HÄR den gamla koden felaktigt tog bort skyddet.
  await page.waitForTimeout(300);

  // t≈850: ÄNNU en oberoende bakgrundsrefresh. Med skyddet felaktigt borttaget
  // skriver den här tillbaka todon till "väntar" (den gamla buggen).
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(150);

  await expect(approvalPanel.getByText("Duka bordet")).toHaveCount(0);
});

// Zaida rapporterade 2026-07-05: godkänner man flera todos i rad hinner bara den
// FÖRSTA faktiskt sparas på servern (stjärnor/pengar delas ut för den) — men
// resten försvinner ändå visuellt ur listan (utan att någonsin sparas), och
// ligger kvar som "väntar på godkännande" efter en sidomladdning. Grundorsak:
// approveTodo/rejectTodo avgjorde om mutationen fick fortsätta ("eligible")
// genom att mutera en yttre variabel INIFRÅN setTodos-uppdateraren och sedan
// läsa tillbaka den direkt efter — men React 18 garanterar inte att en
// funktionell setState-uppdaterare körs synkront. Vid snabbt upprepade klick
// (innan föregående uppdaterare hunnit köras) var den yttre flaggan fortfarande
// sitt ursprungsvärde (false) när koden kollade den, så resten av funktionen
// (det faktiska API-anropet) hoppades felaktigt över — trots att den
// optimistiska UI-uppdateringen senare ändå slog igenom asynkront. Fixat genom
// att avgöra eligibilitet mot todosRef.current (en vanlig ref, alltid synkront
// läsbar) INNAN setTodos anropas, istället för att läsa tillbaka ett värde som
// muterats inuti uppdateraren.
test("Godkänner man flera todos i snabb följd sparas ALLA på servern, inte bara den första", async ({ page }) => {
  const todos = [
    { id: "todo-a", title: "Ett" },
    { id: "todo-b", title: "Två" },
    { id: "todo-c", title: "Tre" }
  ].map((t) => ({ ...DONE_TODO, ...t }));
  const approvedIds: string[] = [];

  await mockAuthAndData(page);
  await page.route("**/api/todos", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: todos.map((t) => ({ ...t, status: approvedIds.includes(t.id) ? "approved" : "done" }))
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route(/\/api\/todos\/(todo-[abc])\/approve/, (route) => {
    const id = route.request().url().match(/todos\/(todo-[abc])\/approve/)![1];
    approvedIds.push(id);
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Todos" }).click();

  const approvalPanel = page.getByRole("region", { name: "Uppgifter att godkänna" });
  await expect(approvalPanel.getByText("Ett")).toBeVisible();

  for (const title of ["Ett", "Två", "Tre"]) {
    await approvalPanel.locator(".approval-row", { hasText: title }).getByTitle("Godkänn").click();
    await page.waitForTimeout(400);
  }

  await expect.poll(() => approvedIds.sort()).toEqual(["todo-a", "todo-b", "todo-c"]);
});
