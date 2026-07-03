import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { MYNT, SEDLAR, reconcileCounts } from "../children/bankDenoms";
import type { Id } from "@shared/types";

function mergeCounts(base: Record<number, number>, add: Record<number, number>): Record<number, number> {
  const next = { ...base };
  for (const [k, n] of Object.entries(add)) {
    next[Number(k)] = (next[Number(k)] ?? 0) + n;
  }
  return next;
}

type WalletStorage = { counts: Record<number, number>; savedTotal: number };

// Måste stämma av mot totalKronor precis som plånboken (ChildBanknotesModal) gör —
// annars visar shopen en cachad, inaktuell summa om barnet tjänat fler stjärnor sen
// plånboken senast öppnades. Se bankDenoms.reconcileCounts.
function loadWallet(childId: Id, totalKronor: number): Record<number, number> {
  try {
    const stored = JSON.parse(
      localStorage.getItem(`bank-counts-${childId}`) ?? "null"
    ) as WalletStorage | null;
    return reconcileCounts(stored, totalKronor);
  } catch {
    return reconcileCounts(null, totalKronor);
  }
}

function saveWallet(childId: Id, counts: Record<number, number>) {
  const cleaned: Record<number, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (Number(v) > 0) cleaned[Number(k)] = Number(v);
  }
  const savedTotal = Object.entries(cleaned).reduce((s, [k, n]) => s + Number(k) * n, 0);
  localStorage.setItem(`bank-counts-${childId}`, JSON.stringify({ counts: cleaned, savedTotal }));
}

export function useShopWalletDrag(childId: Id, availableStars: number) {
  const [walletCounts, setWalletCounts] = useState<Record<number, number>>(
    () => loadWallet(childId, availableStars)
  );
  const [dragging, setDragging] = useState<number | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [pendingPayments, setPendingPayments] = useState<Record<string, Record<number, number>>>({});
  const ghostRef = useRef<HTMLDivElement>(null);

  const bills = SEDLAR.filter((v) => (walletCounts[v] ?? 0) > 0);
  const coins = MYNT.filter((v) => (walletCounts[v] ?? 0) > 0);

  function getCardTotal(itemId: string): number {
    return Object.entries(pendingPayments[itemId] ?? {}).reduce(
      (s, [k, n]) => s + Number(k) * n,
      0
    );
  }

  function clearCardPayment(itemId: string) {
    const pending = pendingPayments[itemId];
    if (!pending) return;
    setWalletCounts((prev) => {
      const next = { ...prev };
      for (const [k, n] of Object.entries(pending)) {
        next[Number(k)] = (next[Number(k)] ?? 0) + n;
      }
      return next;
    });
    setPendingPayments((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  // Plockar bort de sedlar/mynt som blev över från kortet (utan att lägga dem i
  // plånboken än) — det ger den svepande återlämnings-animationen (RewardShopModal)
  // något att visa på väg mot plånboken innan de faktiskt landar där.
  function removeExcessFromCard(itemId: string, excessCounts: Record<number, number>) {
    setPendingPayments((prev) => {
      const current = { ...(prev[itemId] ?? {}) };
      for (const [k, n] of Object.entries(excessCounts)) {
        const key = Number(k);
        current[key] = Math.max(0, (current[key] ?? 0) - n);
        if (current[key] === 0) delete current[key];
      }
      return { ...prev, [itemId]: current };
    });
  }

  // Landar de överblivna sedlarna/mynten i plånboken sedan sväp-animationen är klar.
  function depositToWallet(counts: Record<number, number>) {
    setWalletCounts((current) => {
      const next = mergeCounts(current, counts);
      saveWallet(childId, next);
      return next;
    });
  }

  // Deducts paid notes from localStorage after a successful purchase
  function commitPurchase(itemId: string) {
    setWalletCounts((current) => {
      saveWallet(childId, current);
      return current;
    });
    setPendingPayments((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function startDrag(value: number, e: ReactPointerEvent) {
    if ((walletCounts[value] ?? 0) < 1) return;
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
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = el?.closest("[data-item-id]");
      setActiveCardId(card?.getAttribute("data-item-id") ?? null);
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = el?.closest("[data-item-id]");
      const itemId = card?.getAttribute("data-item-id");

      if (itemId) {
        setWalletCounts((prev) => ({
          ...prev,
          [value]: Math.max(0, (prev[value] ?? 0) - 1),
        }));
        setPendingPayments((prev) => ({
          ...prev,
          [itemId]: {
            ...(prev[itemId] ?? {}),
            [value]: (prev[itemId]?.[value] ?? 0) + 1,
          },
        }));
      }

      setDragging(null);
      setActiveCardId(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // Drag ett mynt/sedel TILLBAKA från ett kort — släpp var som helst utanför kortet = tillbaka till plånboken
  function startCardDrag(value: number, fromItemId: string, e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
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
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = el?.closest("[data-item-id]");
      setActiveCardId(card?.getAttribute("data-item-id") ?? null);
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const card = el?.closest("[data-item-id]");
      const toItemId = card?.getAttribute("data-item-id");

      // Ta bort från ursprungskortet
      setPendingPayments((prev) => {
        const next = { ...prev };
        const fromCounts = { ...(next[fromItemId] ?? {}) };
        fromCounts[value] = Math.max(0, (fromCounts[value] ?? 0) - 1);
        if (fromCounts[value] === 0) delete fromCounts[value];
        if (Object.keys(fromCounts).length === 0) {
          delete next[fromItemId];
        } else {
          next[fromItemId] = fromCounts;
        }

        // Lägg till på ett annat kort, eller tillbaka till plånboken
        if (toItemId && toItemId !== fromItemId) {
          next[toItemId] = {
            ...(next[toItemId] ?? {}),
            [value]: (next[toItemId]?.[value] ?? 0) + 1,
          };
        }
        return next;
      });

      // Tillbaka till plånboken om det inte landade på ett annat kort
      if (!toItemId || toItemId === fromItemId) {
        setWalletCounts((prev) => ({
          ...prev,
          [value]: (prev[value] ?? 0) + 1,
        }));
      }

      setDragging(null);
      setActiveCardId(null);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return {
    walletCounts,
    bills,
    coins,
    dragging,
    activeCardId,
    pendingPayments,
    ghostRef,
    getCardTotal,
    clearCardPayment,
    commitPurchase,
    removeExcessFromCard,
    depositToWallet,
    startDrag,
    startCardDrag,
  };
}
