import { useEffect, useState } from "react";

// Snabbare tickande klocka än useNowTick (som tickar en gång/sekund) — för
// widgets som behöver visa hundradelar av en sekund (2026-08-10, Zaidas
// önskemål: "jag vill kunna se hundradelar på timern då den räknar
// uppåt"). Tickar BARA medan `active` är sant — annars onödig CPU/render
// för en pausad/stängd nedräkning/tidtagning. 50ms (20 uppdateringar/s)
// räcker för en läsbar tvåsiffrig hundradelsindikator utan att bli en
// mätbar prestandakostnad, till skillnad från t.ex. requestAnimationFrame
// (~60/s, onödigt tätt för en siffra som ändå bara visar 100 distinkta
// värden per sekund).
export function useFastTick(active: boolean, intervalMs = 50): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return now;
}
