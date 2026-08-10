// Skjuter upp en icke-kritisk callback till efter första målningen
// (2026-07-26, prestandaomgången — sprint-planning-2026-07-26-performance.md
// S1a). useAppState.ts/useShellState.ts konstruerar i dagsläget SAMTLIGA
// panelers datahookar (todos/kalender/inköp/belöningar/roller/medlemmar/
// belöningsbutik/medaljer/mallar/recept) ovillkorligt vid varje inloggning,
// och var och en av dem gör en egen datahämtning direkt vid mount — dessa
// konkurrerar då om huvudtråden med den allra första renderingen, oavsett
// vilken panel användaren faktiskt tittar på. Medvetet den MINIMALA,
// säkra åtgärden (alternativ (a) i sprintdokumentet): ÄNDRAR INTE vem som
// äger vilken data eller prop-kedjan, bara TIMINGEN på när hämtningen
// startar — en riktig per-panel-lazy-arkitektur (alternativ (b)) är en
// separat, större story som inte görs oplanerat.
// timeout (2026-08-10, se CLAUDE.md:s "Öppen backlogg"-post om
// parent-todo-thread-view.spec.ts:2042): utan denna kan requestIdleCallback
// vänta obegränsat länge om huvudtråden aldrig anses ledig — under CI:s
// flerworkerbelastning (varje Playwright-worker kör en egen Chromium)
// plausibelt längre än Playwrights 5000ms auto-retry-fönster, vilket
// skulle förklara den observerade, ej lokalt reproducerbara stale-roles-
// flakigheten. 1000ms lämnar gott om marginal mot 5000ms samtidigt som
// riktig idle-tid fortfarande hinner användas i normalfallet.
export function deferToIdle(callback: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => callback(), { timeout: 1000 });
  } else {
    // Safari/jsdom saknar requestIdleCallback — setTimeout(0) ger samma
    // "efter den aktuella renderingen, inte blockerande den"-effekt.
    setTimeout(callback, 0);
  }
}
