import { useEffect, useRef, useState } from "react";
import type { Id } from "@shared/types";

const REORDER_DELAY_MS = 5000;

// Delar upp `items` i "inte avklarade" (ordningen orörd — respekterar t.ex.
// manuell drag-and-drop-ordning) och "avklarade" (senast avklarad överst,
// dvs. närmast de aktiva) — men fördröjer SJÄLVA GRUPPBYTET 5s från senaste
// knapptryck (2026-08-10, Zaidas önskemål: listan ska inte hoppa direkt vid
// varje bock/avbock). En post som redan är avklarad/oavklarad FÖRSTA gången
// hooken ser den (efter en sidomladdning eller synk från en annan enhet)
// hamnar i rätt grupp direkt, ingen fördröjning då — bara en riktig
// användar-triggad övergång under sessionen fördröjs.
export function useDelayedCompletionSort<T>(
  items: T[],
  getId: (item: T) => Id,
  isDone: (item: T) => boolean,
  getCompletedAt?: (item: T) => string | null | undefined,
  delayMs: number = REORDER_DELAY_MS
): T[] {
  const seqRef = useRef(new Map<Id, number>());
  const seenIdsRef = useRef(new Set<Id>());
  // Vilka id:n som VERKLIGEN var avklarade senast effekten kördes — skiljer
  // sig medvetet från displayDoneIds under ett fördröjningsfönster (den
  // senare lagar EFTER, i väntan på timern). Jämförs mot DENNA (inte mot
  // displayDoneIds) för att avgöra om något NYTT hänt sedan sist — annars
  // skulle en HELT ORELATERAD omrendering under fördröjningen (t.ex. att en
  // ANNAN post togglas, eller vilken app-aktivitet som helst som råkar
  // trigga om komponenten) felaktigt tolkas som "ännu ett knapptryck" på
  // DEN HÄR posten och nollställa timern i onödan, i värsta fall i all
  // evighet så länge appen har annan bakgrundsaktivitet.
  const lastRealDoneIdsRef = useRef<Set<Id>>(new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const [displayDoneIds, setDisplayDoneIds] = useState<Set<Id>>(() => {
    const initial = new Set<Id>();
    for (const item of items) {
      const id = getId(item);
      seenIdsRef.current.add(id);
      if (isDone(item)) {
        initial.add(id);
        seqRef.current.set(id, completedRank(item, getCompletedAt));
      }
    }
    lastRealDoneIdsRef.current = new Set(initial);
    return initial;
  });

  useEffect(() => {
    const liveIds = new Set(items.map(getId));
    const next = new Set(displayDoneIds);
    let structuralChange = false;

    for (const id of [...next]) {
      if (!liveIds.has(id)) {
        next.delete(id);
        structuralChange = true;
      }
    }
    for (const id of seenIdsRef.current) {
      if (!liveIds.has(id)) seenIdsRef.current.delete(id);
    }
    for (const id of lastRealDoneIdsRef.current) {
      if (!liveIds.has(id)) lastRealDoneIdsRef.current.delete(id);
    }

    let hasRealToggle = false;
    const currentRealDoneIds = new Set<Id>();
    for (const item of items) {
      const id = getId(item);
      const done = isDone(item);
      if (done) currentRealDoneIds.add(id);

      if (!seenIdsRef.current.has(id)) {
        // Helt ny post (första gången hooken ser den) — visa i rätt grupp
        // direkt, ingen fördröjning (det finns inget "knapptryck" att
        // fördröja från).
        seenIdsRef.current.add(id);
        if (done) {
          next.add(id);
          seqRef.current.set(id, completedRank(item, getCompletedAt));
          structuralChange = true;
        }
        continue;
      }

      if (done && !seqRef.current.has(id)) {
        seqRef.current.set(id, completedRank(item, getCompletedAt));
      } else if (!done) {
        seqRef.current.delete(id);
      }

      if (done !== lastRealDoneIdsRef.current.has(id)) hasRealToggle = true;
    }
    lastRealDoneIdsRef.current = currentRealDoneIds;

    if (structuralChange) setDisplayDoneIds(next);

    if (hasRealToggle) {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setDisplayDoneIds(new Set(itemsRef.current.filter(isDone).map(getId)));
        timeoutRef.current = null;
      }, delayMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    []
  );

  const active = items.filter((item) => !displayDoneIds.has(getId(item)));
  const done = items
    .filter((item) => displayDoneIds.has(getId(item)))
    .sort((a, b) => (seqRef.current.get(getId(b)) ?? 0) - (seqRef.current.get(getId(a)) ?? 0));
  return [...active, ...done];
}

function completedRank<T>(item: T, getCompletedAt?: (item: T) => string | null | undefined): number {
  const iso = getCompletedAt?.(item);
  const parsed = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}
