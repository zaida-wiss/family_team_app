import { useEffect, useRef, useState } from "react";
import type { RefObject, PointerEvent as ReactPointerEvent } from "react";
import { DENOM_RULES, MYNT, SEDLAR, countsDiffer, denomCounts } from "./bankDenoms";

export type BankDragZone = {
  dragging: number | null;
  fadeOut: number | null;
  fadeIn: number[];
  zoneCounts: Record<number, number>;
  timerActive: boolean;
  timerKey: number;
  walletCounts: Record<number, number>;
  bills: number[];
  coins: number[];
  canSplit: (v: number) => boolean;
  zoneTotal: number;
  hasZoneItems: boolean;
  upActive: boolean;
  downActive: boolean;
  downOff: boolean;
  wishActive: boolean;
  wishCounts: Record<number, number>;
  wishTotal: number;
  clearWish: () => void;
  splitRule: { s?: Array<[number, number]> } | null;
  startDrag: (value: number, e: ReactPointerEvent) => void;
  upRef: RefObject<HTMLDivElement>;
  downRef: RefObject<HTMLDivElement>;
  wishRef: RefObject<HTMLDivElement>;
  ghostRef: RefObject<HTMLDivElement>;
};

export function useBankDragZone(
  counts: Record<number, number>,
  onSplit: (v: number) => void,
  onZoneConvert: (remove: Record<number, number>, total: number) => void,
): BankDragZone {
  const [dragging, setDragging] = useState<number | null>(null);
  const [activeZone, setActiveZone] = useState<"up" | "down" | "wish" | null>(null);
  const [fadeOut, setFadeOut] = useState<number | null>(null);
  const [fadeIn, setFadeIn] = useState<number[]>([]);
  const [zoneCounts, setZoneCounts] = useState<Record<number, number>>({});
  const [timerActive, setTimerActive] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [wishCounts, setWishCounts] = useState<Record<number, number>>({});

  const upRef = useRef<HTMLDivElement>(null);
  const downRef = useRef<HTMLDivElement>(null);
  const wishRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const zoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoneCountsRef = useRef<Record<number, number>>({});

  useEffect(() => () => {
    if (zoneTimerRef.current) clearTimeout(zoneTimerRef.current);
  }, []);

  const walletCounts: Record<number, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    const rem = v - (zoneCounts[+k] ?? 0) - (wishCounts[+k] ?? 0);
    if (rem > 0) walletCounts[+k] = rem;
  }

  const wishTotal = Object.entries(wishCounts).reduce((s, [k, n]) => s + +k * n, 0);

  const clearWish = () => setWishCounts({});

  const bills = SEDLAR.filter((v) => (walletCounts[v] ?? 0) > 0);
  const coins = MYNT.filter((v) => (walletCounts[v] ?? 0) > 0);
  const canSplit = (v: number) => !!(DENOM_RULES[v]?.s && (walletCounts[v] ?? 0) >= 1);
  const zoneTotal = Object.entries(zoneCounts).reduce((s, [k, n]) => s + +k * n, 0);
  const hasZoneItems = zoneTotal > 0;

  const hitZone = (ref: RefObject<HTMLElement | null>, x: number, y: number) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x >= r.left && x <= r.right && y >= r.top && y <= r.bottom : false;
  };

  const fireZoneConvert = () => {
    const zone = zoneCountsRef.current;
    const total = Object.entries(zone).reduce((s, [k, n]) => s + +k * n, 0);
    if (total <= 0) return;
    const fadeInDenoms = Object.keys(denomCounts(total)).map(Number);
    zoneCountsRef.current = {};
    setZoneCounts({});
    setTimerActive(false);
    zoneTimerRef.current = null;
    onZoneConvert({ ...zone }, total);
    setFadeIn(fadeInDenoms);
    setTimeout(() => setFadeIn([]), 400);
  };

  const addToZone = (value: number) => {
    const walletAvail = (counts[value] ?? 0) - (zoneCountsRef.current[value] ?? 0);
    if (walletAvail < 1) return;
    const newZone = { ...zoneCountsRef.current, [value]: (zoneCountsRef.current[value] ?? 0) + 1 };
    zoneCountsRef.current = newZone;
    setZoneCounts({ ...newZone });
    const total = Object.entries(newZone).reduce((s, [k, n]) => s + +k * n, 0);
    const sufficient = countsDiffer(denomCounts(total), newZone);
    if (zoneTimerRef.current) clearTimeout(zoneTimerRef.current);
    if (sufficient) {
      setTimerKey((k) => k + 1);
      setTimerActive(true);
      zoneTimerRef.current = setTimeout(fireZoneConvert, 5000);
    } else {
      setTimerActive(false);
    }
  };

  const performSplit = (value: number) => {
    setDragging(null);
    setActiveZone(null);
    setFadeOut(value);
    const firstTarget = DENOM_RULES[value]?.s?.[0]?.[0];
    setTimeout(() => {
      onSplit(value);
      setFadeOut(null);
      if (firstTarget !== undefined) {
        setFadeIn([firstTarget]);
        setTimeout(() => setFadeIn([]), 380);
      }
    }, 240);
  };

  const startDrag = (value: number, e: ReactPointerEvent) => {
    e.preventDefault();
    setDragging(value);
    requestAnimationFrame(() => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX}px`;
        ghostRef.current.style.top = `${e.clientY}px`;
      }
    });

    const onMove = (ev: PointerEvent) => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${ev.clientX}px`;
        ghostRef.current.style.top = `${ev.clientY}px`;
      }
      if (hitZone(upRef, ev.clientX, ev.clientY)) setActiveZone("up");
      else if (hitZone(downRef, ev.clientX, ev.clientY)) setActiveZone("down");
      else if (hitZone(wishRef, ev.clientX, ev.clientY)) setActiveZone("wish");
      else setActiveZone(null);
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (hitZone(upRef, ev.clientX, ev.clientY)) {
        setDragging(null);
        setActiveZone(null);
        addToZone(value);
      } else if (hitZone(downRef, ev.clientX, ev.clientY) && canSplit(value)) {
        performSplit(value);
      } else if (hitZone(wishRef, ev.clientX, ev.clientY)) {
        setDragging(null);
        setActiveZone(null);
        setWishCounts((prev) => ({ ...prev, [value]: (prev[value] ?? 0) + 1 }));
      } else {
        setDragging(null);
        setActiveZone(null);
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return {
    dragging,
    fadeOut,
    fadeIn,
    zoneCounts,
    timerActive,
    timerKey,
    walletCounts,
    bills,
    coins,
    canSplit,
    zoneTotal,
    hasZoneItems,
    upActive: dragging !== null && activeZone === "up",
    downActive: dragging !== null && canSplit(dragging) && activeZone === "down",
    downOff: dragging !== null && !canSplit(dragging),
    wishActive: dragging !== null && activeZone === "wish",
    wishCounts,
    wishTotal,
    clearWish,
    splitRule: dragging !== null ? (DENOM_RULES[dragging] ?? null) : null,
    startDrag,
    upRef,
    downRef,
    wishRef,
    ghostRef,
  };
}
