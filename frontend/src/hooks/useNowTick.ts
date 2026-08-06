import { useEffect, useState } from "react";

// Delad sekundtickande klocka (2026-08-06, utbruten ur ParentTodoThreadView.tsx/
// FamilyTodoThreads.tsx, samma mönster nu även i ChildShellContent.tsx/
// MemberShellContent.tsx) — utan denna beräknas "nu" bara EN gång per
// rendering (t.ex. `const now = Date.now()`), vilket gör att en uppgift med
// ett tidsfönster (visibleFrom/expiresAt, t.ex. en morgonrutin) inte
// försvinner exakt när fönstret går ut, bara vid nästa omrendering av en
// ANNAN anledning (en 30s-poll, en SSE-händelse). Zaidas fynd 2026-08-06:
// morgonuppgifter försvann inte i dashboard-vyerna, till skillnad från
// bubbel-trådvyerna som redan tickade.
export function useNowTick(): number {
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return nowTick;
}
